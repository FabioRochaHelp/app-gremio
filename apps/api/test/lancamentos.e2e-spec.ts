import { INestApplication } from '@nestjs/common';
import { competenciaDe, formatarCentavos, type LancamentoDto, type PainelDto } from '@gremio/shared';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import webpush, { WebPushError } from 'web-push';
import { ComprovantesService } from '../src/comprovantes/comprovantes.service';
import { NotificacoesService } from '../src/notificacoes/notificacoes.service';
import { criarApp, criarAssociado } from './app';
import { CHAVE_GREMIO, comprovanteDeHoje, pdfComTexto } from './comprovantes';

// Cabeçalho mínimo de JPEG: a API reconhece o formato pelos primeiros bytes.
const FOTO_NOTA = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);

describe('Lançamentos, estornos, painel e avisos (integração)', () => {
  let app: INestApplication;
  const base = new PrismaClient();
  const competencia = competenciaDe(new Date());
  let tesoureiro: { id: string; token: string };
  let associado: { id: string; token: string };
  let pagante: { id: string; token: string };
  let idCafe: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const painel = async (token: string): Promise<PainelDto> =>
    (await http().get('/api/painel').set(auth(token)).expect(200)).body;

  function lancar(campos: Record<string, string>, foto: Buffer | null = FOTO_NOTA, token = tesoureiro.token) {
    const req = http().post('/api/lancamentos').set(auth(token));
    for (const [campo, valor] of Object.entries(campos)) req.field(campo, valor);
    if (foto) req.attach('comprovante', foto, { filename: 'nota.jpg', contentType: 'image/jpeg' });
    return req;
  }

  beforeAll(async () => {
    app = await criarApp();
    await base.config.upsert({
      where: { id: 1 },
      create: { valorMensalidade: 2000, chavePix: CHAVE_GREMIO, cnpj: null, nomeRecebedor: 'GREMIO', cidade: 'SAO PAULO' },
      update: {},
    });
    tesoureiro = await criarAssociado(app, base, { re: '700001', perfil: 'TESOUREIRO', nome: 'Tesoureiro Teste' });
    associado = await criarAssociado(app, base, { re: '700002', nome: 'Associado Curioso' });
    pagante = await criarAssociado(app, base, { re: '700003', nome: 'Pagante Discreto' });
    idCafe = (await base.categoria.upsert({ where: { nome: 'Café' }, create: { nome: 'Café' }, update: {} })).id;
  });

  afterAll(async () => {
    await base.$disconnect();
    await app.close();
  });

  describe('despesas', () => {
    it('exige foto da nota em formato aceito, categoria e perfil de tesoureiro', async () => {
      const campos = { tipo: 'SAIDA', categoriaId: idCafe, valor: '3500', descricao: 'Café e açúcar do mês' };
      await lancar(campos, null).expect(400);
      await lancar(campos, Buffer.from('isto não é uma imagem')).expect(400);
      await lancar({ ...campos, categoriaId: '' }).expect(400);
      await lancar(campos, FOTO_NOTA, associado.token).expect(403);
    });

    it('recusa data futura e mês já fechado', async () => {
      const campos = { tipo: 'SAIDA', categoriaId: idCafe, valor: '1000', descricao: 'Filtro de café' };
      await lancar({ ...campos, data: '2099-01-10' }).expect(400);
      await base.fechamentoMensal.create({
        data: {
          competencia: '2021-03',
          saldoSistema: 0,
          saldoBanco: 0,
          extratoKey: 'teste/extrato.pdf',
          divergencias: [],
          fechadoPorId: tesoureiro.id,
        },
      });
      const res = await lancar({ ...campos, data: '2021-03-15' }).expect(409);
      expect(res.body.message).toMatch(/fechado/);
    });

    it('lança a despesa, mostra no extrato e libera o comprovante para todos', async () => {
      const antes = await painel(associado.token);
      const res = await lancar({ tipo: 'SAIDA', categoriaId: idCafe, valor: '3500', descricao: 'Café e açúcar do mês' }).expect(201);
      const despesa: LancamentoDto = res.body;
      expect(despesa).toMatchObject({ tipo: 'SAIDA', efeito: -3500, categoria: { nome: 'Café' }, comprovanteVisivel: true });

      const extrato = await http().get('/api/lancamentos').query({ competencia }).set(auth(associado.token)).expect(200);
      const visto = extrato.body.find((l: LancamentoDto) => l.id === despesa.id);
      expect(visto.autor).toEqual({ nome: 'Tesoureiro Teste', posto: 'Sd' });
      const link = await http().get(`/api/lancamentos/${despesa.id}/comprovante`).set(auth(associado.token)).expect(200);
      expect((await fetch(link.body.url)).status).toBe(200);

      const depois = await painel(associado.token);
      expect(depois.saldo - antes.saldo).toBe(-3500);
      expect(depois.mesAtual.saidas - antes.mesAtual.saidas).toBe(3500);
      expect(depois.categorias.find((c) => c.nome === 'Café')!.total).toBeGreaterThanOrEqual(3500);
    });
  });

  describe('estornos', () => {
    it('desfaz o lançamento uma única vez, com motivo, sem apagar nada', async () => {
      const despesa: LancamentoDto = (
        await lancar({ tipo: 'SAIDA', categoriaId: idCafe, valor: '800', descricao: 'Copos descartáveis' }).expect(201)
      ).body;
      const antes = await painel(tesoureiro.token);

      await http().post(`/api/lancamentos/${despesa.id}/estorno`).set(auth(tesoureiro.token)).send({ motivo: 'x' }).expect(400);
      await http()
        .post(`/api/lancamentos/${despesa.id}/estorno`)
        .set(auth(associado.token))
        .send({ motivo: 'Lançado em duplicidade' })
        .expect(403);
      const estorno: LancamentoDto = (
        await http()
          .post(`/api/lancamentos/${despesa.id}/estorno`)
          .set(auth(tesoureiro.token))
          .send({ motivo: 'Lançado em duplicidade' })
          .expect(201)
      ).body;
      expect(estorno).toMatchObject({ tipo: 'ESTORNO', efeito: 800, estornoDe: { id: despesa.id } });

      await http()
        .post(`/api/lancamentos/${despesa.id}/estorno`)
        .set(auth(tesoureiro.token))
        .send({ motivo: 'De novo, por engano' })
        .expect(409);
      await http()
        .post(`/api/lancamentos/${estorno.id}/estorno`)
        .set(auth(tesoureiro.token))
        .send({ motivo: 'Estorno do estorno' })
        .expect(409);

      const original = (await http().get(`/api/lancamentos/${despesa.id}`).set(auth(associado.token)).expect(200)).body;
      expect(original.estornadoPor).toMatchObject({ id: estorno.id, motivo: 'Lançado em duplicidade' });
      const depois = await painel(tesoureiro.token);
      expect(depois.saldo - antes.saldo).toBe(800);
      expect(depois.mesAtual.saidas - antes.mesAtual.saidas).toBe(-800);
    });
  });

  describe('entradas de mensalidade', () => {
    let idEntrada: string;
    let idMensalidade: string;

    beforeAll(async () => {
      const mensalidade = await base.mensalidade.create({
        data: { associadoId: pagante.id, competencia, valor: 2000 },
      });
      idMensalidade = mensalidade.id;
      const { linhas } = comprovanteDeHoje();
      await http()
        .post(`/api/mensalidades/${mensalidade.id}/comprovante`)
        .set(auth(pagante.token))
        .attach('arquivo', await pdfComTexto(linhas), { filename: 'pix.pdf', contentType: 'application/pdf' })
        .expect(201);
      await app.get(ComprovantesService).processar(mensalidade.id);
      idEntrada = (await base.mensalidade.findUniqueOrThrow({ where: { id: mensalidade.id } })).lancamentoId!;
    });

    it('esconde pagador e comprovante dos outros associados, mas não do tesoureiro nem do dono', async () => {
      const paraOutro = (await http().get(`/api/lancamentos/${idEntrada}`).set(auth(associado.token)).expect(200)).body;
      expect(paraOutro).toMatchObject({ deMensalidade: true, autor: null, comprovanteVisivel: false });
      expect(JSON.stringify(paraOutro)).not.toContain('Pagante');
      await http().get(`/api/lancamentos/${idEntrada}/comprovante`).set(auth(associado.token)).expect(404);

      const paraTesoureiro = (await http().get(`/api/lancamentos/${idEntrada}`).set(auth(tesoureiro.token)).expect(200)).body;
      expect(paraTesoureiro).toMatchObject({ autor: { nome: 'Pagante Discreto' }, comprovanteVisivel: true });
      await http().get(`/api/lancamentos/${idEntrada}/comprovante`).set(auth(pagante.token)).expect(200);
    });

    it('estornar a baixa reabre a mensalidade e bloqueia o mesmo comprovante', async () => {
      await http()
        .post(`/api/lancamentos/${idEntrada}/estorno`)
        .set(auth(tesoureiro.token))
        .send({ motivo: 'Crédito não apareceu no extrato do banco' })
        .expect(201);
      const reaberta = await base.mensalidade.findUniqueOrThrow({ where: { id: idMensalidade } });
      expect(reaberta).toMatchObject({ status: 'ABERTA', lancamentoId: null, motivoRecusa: expect.stringContaining('estornado') });

      // Reenvia o mesmo comprovante: a leitura automática não pode aceitar de novo.
      const chave = reaberta.comprovanteKey!;
      await base.mensalidade.update({ where: { id: idMensalidade }, data: { status: 'EM_ANALISE', comprovanteKey: chave } });
      await app.get(ComprovantesService).processar(idMensalidade);
      expect(await base.mensalidade.findUniqueOrThrow({ where: { id: idMensalidade } })).toMatchObject({
        status: 'EM_REVISAO',
        motivoRecusa: expect.stringContaining('já foi usado'),
      });
    });
  });

  describe('avisos push', () => {
    afterEach(() => jest.restoreAllMocks());

    it('avisa todos a cada despesa, sem dados pessoais, e remove inscrições expiradas', async () => {
      await base.pushSubscription.createMany({
        data: [
          { associadoId: associado.id, endpoint: 'https://push.exemplo/ativa', p256dh: 'p', auth: 'a' },
          { associadoId: pagante.id, endpoint: 'https://push.exemplo/expirada', p256dh: 'p', auth: 'a' },
        ],
      });
      const enviados: { endpoint: string; conteudo: string }[] = [];
      jest.spyOn(webpush, 'sendNotification').mockImplementation(async (inscricao, conteudo) => {
        if (inscricao.endpoint.endsWith('expirada')) {
          throw new WebPushError('Gone', 410, {}, '', inscricao.endpoint);
        }
        enviados.push({ endpoint: inscricao.endpoint, conteudo: String(conteudo) });
        return { statusCode: 201, body: '', headers: {} };
      });

      const despesa: LancamentoDto = (
        await lancar({ tipo: 'SAIDA', categoriaId: idCafe, valor: '1290', descricao: 'Pó de café 500g' }).expect(201)
      ).body;
      const resultado = await app.get(NotificacoesService).avisarLancamento(despesa.id);

      expect(resultado).toEqual({ enviados: 1, removidos: 1 });
      expect(JSON.parse(enviados[0].conteudo)).toEqual({
        titulo: `Despesa: ${formatarCentavos(1290)}`,
        corpo: 'Café — Pó de café 500g',
        url: `/extrato/${despesa.id}`,
      });
      expect(await base.pushSubscription.count({ where: { endpoint: 'https://push.exemplo/expirada' } })).toBe(0);
    });

    it('não avisa baixas de mensalidade', async () => {
      const espiao = jest.spyOn(webpush, 'sendNotification');
      const entrada = await base.lancamento.findFirstOrThrow({ where: { mensalidadeId: { not: null } } });
      expect(await app.get(NotificacoesService).avisarLancamento(entrada.id)).toEqual({ enviados: 0, removidos: 0 });
      expect(espiao).not.toHaveBeenCalled();
    });

    it('inscreve e cancela o aparelho do usuário', async () => {
      const inscricao = { endpoint: 'https://push.exemplo/novo', keys: { p256dh: 'chave', auth: 'segredo' } };
      await http().post('/api/notificacoes/inscricao').set(auth(associado.token)).send(inscricao).expect(204);
      expect(await base.pushSubscription.count({ where: { endpoint: inscricao.endpoint } })).toBe(1);
      await http()
        .delete('/api/notificacoes/inscricao')
        .set(auth(associado.token))
        .send({ endpoint: inscricao.endpoint })
        .expect(204);
      expect(await base.pushSubscription.count({ where: { endpoint: inscricao.endpoint } })).toBe(0);
    });
  });
});
