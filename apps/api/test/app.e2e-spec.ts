import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AuthService } from '../src/auth/auth.service';
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
      expect(criado.body.convite.codigo).toBe('ACEITAR');

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

    it('edita os dados cadastrais, inclusive o RE, sem duplicar', async () => {
      const http = request(app.getHttpServer());
      const associado = await base.associado.create({
        data: { nome: 'Sd Digitado', re: '900005', posto: 'Sd', unidade: 'GB' },
      });
      const editado = await http
        .patch(`/api/associados/${associado.id}`)
        .set('Authorization', `Bearer ${tokenTesoureiro}`)
        .send({ nome: 'Sd Corrigido', re: '900.006', posto: 'Cb', unidade: '2º GB' })
        .expect(200);
      expect(editado.body).toMatchObject({ nome: 'Sd Corrigido', re: '900006', posto: 'Cb', unidade: '2º GB' });

      await http
        .patch(`/api/associados/${associado.id}`)
        .set('Authorization', `Bearer ${tokenTesoureiro}`)
        .send({ re: '900001' })
        .expect(409);
    });

    it('guarda o celular no formato do WhatsApp', async () => {
      const http = request(app.getHttpServer());
      const auth = { Authorization: `Bearer ${tokenTesoureiro}` };
      const criado = await http
        .post('/api/associados')
        .set(auth)
        .send({ nome: 'Sd Celular', re: '900009', posto: 'Sd', unidade: 'GB', celular: '(11) 98765-4321' })
        .expect(201);
      expect(criado.body.associado.celular).toBe('5511987654321');
      const id = criado.body.associado.id;

      const invalido = await http.patch(`/api/associados/${id}`).set(auth).send({ celular: '1234-5678' }).expect(400);
      expect(invalido.body.erros[0].campo).toBe('celular');

      const comDdi = await http.patch(`/api/associados/${id}`).set(auth).send({ celular: '+55 21 99876-5432' }).expect(200);
      expect(comDdi.body.celular).toBe('5521998765432');

      const apagado = await http.patch(`/api/associados/${id}`).set(auth).send({ celular: '' }).expect(200);
      expect(apagado.body.celular).toBeNull();
    });

    it('exclui só quem não tem histórico financeiro', async () => {
      const http = request(app.getHttpServer());
      const auth = { Authorization: `Bearer ${tokenTesoureiro}` };

      const novo = await base.associado.create({
        data: {
          nome: 'Sd Novo',
          re: '900007',
          posto: 'Sd',
          unidade: 'GB',
          mensalidades: { create: { competencia: '2099-01', valor: 1000 } },
        },
      });
      await http.delete(`/api/associados/${novo.id}`).set(auth).expect(204);
      expect(await base.associado.findUnique({ where: { id: novo.id } })).toBeNull();
      expect(await base.mensalidade.count({ where: { associadoId: novo.id } })).toBe(0);

      const pagante = await base.associado.create({
        data: {
          nome: 'Sd Pagante',
          re: '900008',
          posto: 'Sd',
          unidade: 'GB',
          mensalidades: { create: { competencia: '2099-01', valor: 1000, status: 'PAGA' } },
        },
      });
      const recusa = await http.delete(`/api/associados/${pagante.id}`).set(auth).expect(409);
      expect(recusa.body.message).toMatch(/histórico financeiro/);

      await http.delete(`/api/associados/${idTesoureiro}`).set(auth).expect(409);
    });

    it('usa ACEITAR só no primeiro acesso de associados', async () => {
      const http = request(app.getHttpServer());
      const auth = { Authorization: `Bearer ${tokenTesoureiro}` };
      const ativar = (re: string, codigo: string) =>
        http.post('/api/auth/ativar').send({ re, codigo, senha: 'senha-nova-1' });

      // Redefinição de senha: código aleatório, e a palavra fixa deixa de valer.
      const associado = await http
        .post('/api/associados')
        .set(auth)
        .send({ nome: 'Sd Esquecido', re: '900010', posto: 'Sd', unidade: 'GB' })
        .expect(201);
      await ativar('900010', 'aceitar').expect(200);
      const redefinir = await http.post(`/api/associados/${associado.body.associado.id}/convite`).set(auth).expect(201);
      expect(redefinir.body.codigo).toMatch(/^[A-Z0-9]{8}$/);
      await ativar('900010', 'ACEITAR').expect(401);
      await ativar('900010', redefinir.body.codigo).expect(200);

      // Tesoureiro cadastrado já como tesoureiro recebe código aleatório.
      const tesoureiro = await http
        .post('/api/associados')
        .set(auth)
        .send({ nome: 'Sgt Tesoureiro', re: '900011', posto: 'Sgt', unidade: 'GB', perfil: 'TESOUREIRO' })
        .expect(201);
      expect(tesoureiro.body.convite.codigo).toMatch(/^[A-Z0-9]{8}$/);

      // Promovido a tesoureiro com o convite ACEITAR pendente: a palavra fixa não vale mais.
      const promovido = await http
        .post('/api/associados')
        .set(auth)
        .send({ nome: 'Cb Promovido', re: '900012', posto: 'Cb', unidade: 'GB' })
        .expect(201);
      await http
        .patch(`/api/associados/${promovido.body.associado.id}`)
        .set(auth)
        .send({ perfil: 'TESOUREIRO' })
        .expect(200);
      // Direto no serviço: a rota tem limite de tentativas, já gasto pelos testes acima.
      await expect(
        app.get(AuthService).ativar({ re: '900012', codigo: 'ACEITAR', senha: 'senha-nova-1' }),
      ).rejects.toThrow('Código de convite inválido ou expirado');
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
