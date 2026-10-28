import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { criarApp, criarAssociado } from './app';

describe('API (integração)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const base = new PrismaClient();
  let tokenTesoureiro: string;
  let idTesoureiro: string;

  beforeAll(async () => {
    app = await criarApp();
    prisma = app.get(PrismaService);
    const tesoureiro = await criarAssociado(app, base, { re: '900001', perfil: 'TESOUREIRO' });
    idTesoureiro = tesoureiro.id;
    tokenTesoureiro = tesoureiro.token;
  });

  afterAll(async () => {
    await base.$disconnect();
    await app.close();
  });

  describe('imutabilidade', () => {
    let idLancamento: string;

    beforeAll(async () => {
      const lancamento = await prisma.db.lancamento.create({
        data: {
          tipo: 'SAIDA',
          valor: 1500,
          descricao: 'Café do mês',
          comprovanteKey: 'teste/nota.jpg',
          autorId: idTesoureiro,
          data: new Date(),
          competencia: '2026-10',
        },
      });
      idLancamento = lancamento.id;
    });

    it('bloqueia update e delete de lançamento pelo Prisma', async () => {
      await expect(
        prisma.db.lancamento.update({ where: { id: idLancamento }, data: { valor: 1 } }),
      ).rejects.toThrow(/imutável/);
      await expect(prisma.db.lancamento.delete({ where: { id: idLancamento } })).rejects.toThrow(/imutável/);
      await expect(prisma.db.lancamento.deleteMany({})).rejects.toThrow(/imutável/);
    });

    it('bloqueia update e delete de lançamento direto no banco', async () => {
      await expect(
        base.$executeRawUnsafe(`UPDATE lancamentos SET valor = 1 WHERE id = '${idLancamento}'`),
      ).rejects.toThrow(/imutável/);
      await expect(base.$executeRawUnsafe(`DELETE FROM lancamentos`)).rejects.toThrow(/imutável/);
      await expect(base.$executeRawUnsafe(`DELETE FROM audit_log`)).rejects.toThrow(/imutável/);
    });

    it('permite um estorno por lançamento', async () => {
      const estorno = {
        tipo: 'ESTORNO' as const,
        valor: 1500,
        descricao: 'Estorno',
        autorId: idTesoureiro,
        data: new Date(),
        competencia: '2026-10',
        estornoDeId: idLancamento,
        motivoEstorno: 'Valor lançado em duplicidade',
      };
      await prisma.db.lancamento.create({ data: estorno });
      await expect(prisma.db.lancamento.create({ data: estorno })).rejects.toMatchObject({ code: 'P2002' });
    });

    it('no fechamento, só aceita preencher o PDF uma vez', async () => {
      const fechamento = await prisma.db.fechamentoMensal.create({
        data: {
          competencia: '2026-09',
          saldoSistema: 100,
          saldoBanco: 100,
          extratoKey: 'teste/extrato.pdf',
          divergencias: [],
          fechadoPorId: idTesoureiro,
        },
      });
      await expect(
        prisma.db.fechamentoMensal.update({ where: { id: fechamento.id }, data: { saldoBanco: 0 } }),
      ).rejects.toThrow(/imutável/);
      await prisma.db.fechamentoMensal.update({ where: { id: fechamento.id }, data: { pdfKey: 'teste/a.pdf' } });
      await expect(
        prisma.db.fechamentoMensal.update({ where: { id: fechamento.id }, data: { pdfKey: 'teste/b.pdf' } }),
      ).rejects.toThrow(/imutável/);
    });
  });

  describe('associados e perfis', () => {
    it('cadastra, ativa por convite e respeita perfil e termo', async () => {
      const http = request(app.getHttpServer());
      const criado = await http
        .post('/api/associados')
        .set('Authorization', `Bearer ${tokenTesoureiro}`)
        .send({ nome: 'Soldado Teste', re: '900.002-3', posto: 'Sd', unidade: 'GB' })
        .expect(201);
      expect(criado.body.associado).toMatchObject({ re: '9000023', ativado: false });

      await http
        .post('/api/auth/ativar')
        .send({ re: '9000023', codigo: 'ERRADO12', senha: 'senha-nova-1' })
        .expect(401);
      const ativado = await http
        .post('/api/auth/ativar')
        .send({ re: '9000023', codigo: criado.body.convite.codigo, senha: 'senha-nova-1' })
        .expect(200);
      const token = ativado.body.accessToken;

      const termo = await http.get('/api/categorias').set('Authorization', `Bearer ${token}`).expect(403);
      expect(termo.body.codigo).toBe('TERMO_PENDENTE');

      await http.post('/api/auth/termo').set('Authorization', `Bearer ${token}`).expect(200);
      // Lista com situação (inadimplência) é só do tesoureiro.
      await http.get('/api/associados').set('Authorization', `Bearer ${token}`).expect(403);
      await http.get('/api/categorias').set('Authorization', `Bearer ${token}`).expect(200);

      const auditoria = await base.auditLog.findMany({
        where: { tabela: 'Associado', registroId: criado.body.associado.id },
      });
      expect(auditoria.map((a) => a.acao)).toEqual(expect.arrayContaining(['create', 'update']));
      expect(auditoria.find((a) => a.acao === 'create')?.autorId).toBe(idTesoureiro);
      expect(JSON.stringify(auditoria)).not.toMatch(/\$2[aby]\$/);
    });

    it('troca de senha invalida os tokens anteriores', async () => {
      const http = request(app.getHttpServer());
      await base.associado.create({
        data: {
          nome: 'Cabo Teste',
          re: '900004',
          posto: 'Cb',
          unidade: 'GB',
          senhaHash: await hash('senha-antiga', 4),
          termoAceitoEm: new Date(),
        },
      });
      const login = await http.post('/api/auth/login').send({ re: '900004', senha: 'senha-antiga' }).expect(200);
      const antigo = login.body.accessToken;
      await http
        .post('/api/auth/senha')
        .set('Authorization', `Bearer ${antigo}`)
        .send({ senhaAtual: 'senha-antiga', novaSenha: 'senha-nova-123' })
        .expect(200);
      await http.get('/api/auth/me').set('Authorization', `Bearer ${antigo}`).expect(401);
    });

    it('não deixa o grêmio sem tesoureiro', async () => {
      // O banco de teste é compartilhado entre arquivos: deixa este como o único tesoureiro.
      await base.associado.updateMany({
        where: { perfil: 'TESOUREIRO', id: { not: idTesoureiro } },
        data: { perfil: 'ASSOCIADO' },
      });
      await request(app.getHttpServer())
        .patch(`/api/associados/${idTesoureiro}`)
        .set('Authorization', `Bearer ${tokenTesoureiro}`)
        .send({ perfil: 'ASSOCIADO' })
        .expect(409);
    });
  });
});
