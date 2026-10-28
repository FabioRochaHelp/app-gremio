import { INestApplication } from '@nestjs/common';
import type { FechamentoDto, PreviaFechamentoDto } from '@gremio/shared';
import { PrismaClient } from '@prisma/client';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { extrairTexto } from '../src/comprovantes/pdf';
import { FechamentosService } from '../src/fechamentos/fechamentos.service';
import { motorPdf } from '../src/fechamentos/relatorio';
import { StorageService } from '../src/storage/storage.service';
import { criarApp, criarAssociado } from './app';
import { CHAVE_GREMIO, pdfComTexto, pngSimples } from './comprovantes';

// Mês passado fixo, sem lançamentos dos outros arquivos de teste.
const MES = '2026-08';
const E2E_COM_CREDITO = 'E18236120202608051200okokokokok1';
const E2E_SEM_CREDITO = 'E18236120202608061200semcredito1';

// O Jest não carrega o Puppeteer (só ESM): renderiza com o Chrome num processo Node à parte.
motorPdf.renderizar = (html) =>
  new Promise((ok, falha) => {
    const filho = execFile(
      process.execPath,
      [join(__dirname, 'renderizar-pdf.mjs')],
      { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: '' } },
      (erro, saida) => (erro ? falha(erro) : ok(new Uint8Array(saida))),
    );
    filho.stdin!.end(html);
  });

describe('Fechamento mensal e prestação de contas (integração)', () => {
  let app: INestApplication;
  const base = new PrismaClient();
  let tesoureiro: { id: string; token: string };
  let associado: { id: string; token: string };
  let pagante: { id: string; token: string };

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function fechar(campos: Record<string, string>, extrato: Buffer | null, token = tesoureiro.token) {
    const req = http().post('/api/fechamentos').set(auth(token));
    for (const [campo, valor] of Object.entries(campos)) req.field(campo, valor);
    if (extrato) req.attach('extrato', extrato, { filename: 'extrato.pdf', contentType: 'application/pdf' });
    return req;
  }

  /** Mensalidade paga em agosto, com a entrada correspondente no caixa. */
  async function mensalidadePaga(associadoId: string, e2eId: string, dia: number, competencia: string) {
    const mensalidade = await base.mensalidade.create({
      data: { associadoId, competencia, valor: 2000, e2eId, tipoBaixa: 'AUTOMATICA', comprovanteKey: 'teste/pix.pdf' },
    });
    const lancamento = await base.lancamento.create({
      data: {
        tipo: 'ENTRADA',
        valor: 2000,
        descricao: `Mensalidade de ${competencia}`,
        comprovanteKey: 'teste/pix.pdf',
        autorId: associadoId,
        data: new Date(`2026-08-${String(dia).padStart(2, '0')}T15:00:00Z`),
        competencia: MES,
        mensalidadeId: mensalidade.id,
      },
    });
    await base.mensalidade.update({ where: { id: mensalidade.id }, data: { status: 'PAGA', lancamentoId: lancamento.id } });
  }

  beforeAll(async () => {
    app = await criarApp();
    await base.config.upsert({
      where: { id: 1 },
      create: { valorMensalidade: 2000, chavePix: CHAVE_GREMIO, cnpj: null, nomeRecebedor: 'GREMIO TESTE', cidade: 'SAO PAULO' },
      update: {},
    });
    tesoureiro = await criarAssociado(app, base, { re: '600001', perfil: 'TESOUREIRO', nome: 'Tesoureira Fecha' });
    associado = await criarAssociado(app, base, { re: '600002' });
    pagante = await criarAssociado(app, base, { re: '600003', nome: 'Pagante Sigiloso' });

    await mensalidadePaga(pagante.id, E2E_COM_CREDITO, 5, '2026-08');
    await mensalidadePaga(associado.id, E2E_SEM_CREDITO, 6, '2026-07');

    const storage = app.get(StorageService);
    await storage.enviar('teste/nota-agosto.png', pngSimples(), 'image/png');
    const categoria = await base.categoria.upsert({ where: { nome: 'Reparos' }, create: { nome: 'Reparos' }, update: {} });
    await base.lancamento.create({
      data: {
        tipo: 'SAIDA',
        valor: 1500,
        descricao: 'Troca da resistência do chuveiro',
        categoriaId: categoria.id,
        comprovanteKey: 'teste/nota-agosto.png',
        autorId: tesoureiro.id,
        data: new Date('2026-08-10T15:00:00Z'),
        competencia: MES,
      },
    });
  });

  afterAll(async () => {
    await base.$disconnect();
    await app.close();
  });

  it('a prévia mostra o saldo do sistema no fim do mês', async () => {
    const previa: PreviaFechamentoDto = (
      await http().get('/api/fechamentos/previa').query({ competencia: MES }).set(auth(tesoureiro.token)).expect(200)
    ).body;
    expect(previa).toMatchObject({ competencia: MES, entradas: 4000, saidas: 1500, jaFechado: false });
    expect(previa.saldoSistema - previa.saldoInicial).toBe(2500);
    await http().get('/api/fechamentos/previa').query({ competencia: MES }).set(auth(associado.token)).expect(403);
  });

  it('valida perfil, mês já terminado e extrato em PDF', async () => {
    const extrato = await pdfComTexto(['Extrato']);
    await fechar({ competencia: MES, saldoBanco: '0' }, extrato, associado.token).expect(403);
    await fechar({ competencia: '2099-01', saldoBanco: '0' }, extrato).expect(400);
    await fechar({ competencia: MES, saldoBanco: '0' }, null).expect(400);
  });

  it('fecha o mês apontando diferença de saldo e mensalidade sem crédito no banco', async () => {
    const previa: PreviaFechamentoDto = (
      await http().get('/api/fechamentos/previa').query({ competencia: MES }).set(auth(tesoureiro.token))
    ).body;
    const extrato = await pdfComTexto([
      'Extrato Agosto/2026',
      '05/08/2026 Pix recebido PAGANTE SIGILOSO 20,00',
      `ID ${E2E_COM_CREDITO}`,
      '10/08/2026 Pix enviado ELETRICA -15,00',
    ]);
    const saldoBanco = previa.saldoSistema - 2000;
    const fechamento: FechamentoDto = (
      await fechar({ competencia: MES, saldoBanco: String(saldoBanco) }, extrato).expect(201)
    ).body;

    expect(fechamento.divergencias).toEqual([
      { tipo: 'SALDO', saldoSistema: previa.saldoSistema, saldoBanco, diferenca: -2000 },
      expect.objectContaining({ tipo: 'MENSALIDADE_SEM_CREDITO', valor: 2000 }),
    ]);
    expect(JSON.stringify(fechamento)).not.toContain('Sigiloso');
    await fechar({ competencia: MES, saldoBanco: '0' }, extrato).expect(409);
  });

  it('trava lançamentos no mês fechado e nos anteriores', async () => {
    for (const data of [`${MES}-20`, '2026-07-15']) {
      await http()
        .post('/api/lancamentos')
        .set(auth(tesoureiro.token))
        .field('tipo', 'ENTRADA')
        .field('valor', '100')
        .field('descricao', 'Doação atrasada')
        .field('data', data)
        .attach('comprovante', pngSimples(), { filename: 'nota.png', contentType: 'image/png' })
        .expect(409);
    }
  });

  it('gera o PDF com resumo, divergências e o comprovante da despesa, sem expor pagadores', async () => {
    await app.get(FechamentosService).gerarPrestacao(MES);

    const lista: FechamentoDto[] = (await http().get('/api/fechamentos').set(auth(associado.token)).expect(200)).body;
    expect(lista.find((f) => f.competencia === MES)?.pdfPronto).toBe(true);

    const link = await http().get(`/api/fechamentos/${MES}/pdf`).set(auth(associado.token)).expect(200);
    const pdf = Buffer.from(await (await fetch(link.body.url)).arrayBuffer());
    const documento = await PDFDocument.load(pdf);
    // Relatório (1+ página) e o anexo da nota.
    expect(documento.getPageCount()).toBeGreaterThanOrEqual(2);

    const texto = await extrairTexto(pdf);
    expect(texto).toContain('Prestação de contas');
    expect(texto).toContain('divergência');
    expect(texto).toContain('Troca da resistência do chuveiro');
    expect(texto).toContain('Anexo 1');
    expect(texto).not.toContain('Sigiloso');

    // O extrato do banco é só do tesoureiro.
    await http().get(`/api/fechamentos/${MES}/extrato`).set(auth(associado.token)).expect(403);
    await http().get(`/api/fechamentos/${MES}/extrato`).set(auth(tesoureiro.token)).expect(200);

    // O PDF só é gravado uma vez.
    const registro = await base.fechamentoMensal.findUniqueOrThrow({ where: { competencia: MES } });
    await expect(
      base.$executeRawUnsafe(`UPDATE fechamentos_mensais SET pdf_key = 'outro.pdf' WHERE id = '${registro.id}'`),
    ).rejects.toThrow(/imutável/);
  });
});
