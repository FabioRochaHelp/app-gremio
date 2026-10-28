import { INestApplication } from '@nestjs/common';
import { competenciaDe } from '@gremio/shared';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { ComprovantesService } from '../src/comprovantes/comprovantes.service';
import { MensalidadesService } from '../src/mensalidades/mensalidades.service';
import { criarApp, criarAssociado } from './app';
import { CHAVE_GREMIO, comprovanteDeHoje, pdfComTexto, pdfSemTexto } from './comprovantes';


describe('Mensalidades e baixa automática (integração)', () => {
  let app: INestApplication;
  let comprovantes: ComprovantesService;
  const base = new PrismaClient();
  const competencia = competenciaDe(new Date());
  let tesoureiro: { id: string; token: string };
  let associado: { id: string; token: string };
  let outro: { id: string; token: string };

  const http = () => request(app.getHttpServer());
  const minha = async (token: string) =>
    (await http().get('/api/mensalidades/minhas').set('Authorization', `Bearer ${token}`).expect(200)).body[0];
  const enviar = (id: string, token: string, pdf: Buffer, nome = 'comprovante.pdf') =>
    http()
      .post(`/api/mensalidades/${id}/comprovante`)
      .set('Authorization', `Bearer ${token}`)
      .attach('arquivo', pdf, { filename: nome, contentType: 'application/pdf' });

  beforeAll(async () => {
    app = await criarApp();
    comprovantes = app.get(ComprovantesService);
    await base.config.upsert({
      where: { id: 1 },
      create: { valorMensalidade: 2000, chavePix: CHAVE_GREMIO, cnpj: null, nomeRecebedor: 'GREMIO', cidade: 'SAO PAULO' },
      update: { valorMensalidade: 2000, chavePix: CHAVE_GREMIO },
    });
    tesoureiro = await criarAssociado(app, base, { re: '800001', perfil: 'TESOUREIRO' });
    associado = await criarAssociado(app, base, { re: '800002' });
    outro = await criarAssociado(app, base, { re: '800003' });

    await http()
      .post('/api/mensalidades/gerar')
      .set('Authorization', `Bearer ${tesoureiro.token}`)
      .send({ competencia })
      .expect(200);
  });

  afterAll(async () => {
    await base.$disconnect();
    await app.close();
  });

  it('gera uma mensalidade por associado sem duplicar', async () => {
    const segunda = await http()
      .post('/api/mensalidades/gerar')
      .set('Authorization', `Bearer ${tesoureiro.token}`)
      .send({ competencia })
      .expect(200);
    expect(segunda.body.criadas).toBe(0);
    expect(await minha(associado.token)).toMatchObject({ competencia, valor: 2000, status: 'ABERTA' });
  });

  it('gera o Pix copia e cola com o valor da mensalidade', async () => {
    const { id } = await minha(associado.token);
    const res = await http().get(`/api/mensalidades/${id}/pix`).set('Authorization', `Bearer ${associado.token}`).expect(200);
    expect(res.body.copiaECola).toContain('540520.00');
    expect(res.body.qrCode).toMatch(/^data:image\/svg\+xml;base64,/);
    await http().get(`/api/mensalidades/${id}/pix`).set('Authorization', `Bearer ${outro.token}`).expect(404);
  });

  it('recusa arquivo que não é PDF e envio de outra pessoa', async () => {
    const { id } = await minha(associado.token);
    await enviar(id, associado.token, Buffer.from('não sou um pdf'), 'foto.pdf').expect(400);
    const { linhas } = comprovanteDeHoje();
    await enviar(id, outro.token, await pdfComTexto(linhas)).expect(404);
  });

  it('dá baixa automática num comprovante válido e cria a entrada no caixa', async () => {
    const { id } = await minha(associado.token);
    const { linhas, e2e } = comprovanteDeHoje();
    const enviado = await enviar(id, associado.token, await pdfComTexto(linhas)).expect(201);
    expect(enviado.body.status).toBe('EM_ANALISE');

    await comprovantes.processar(id);

    const mensalidade = await base.mensalidade.findUniqueOrThrow({ where: { id }, include: { lancamento: true } });
    expect(mensalidade).toMatchObject({ status: 'PAGA', tipoBaixa: 'AUTOMATICA', e2eId: e2e });
    expect(mensalidade.lancamento).toMatchObject({ tipo: 'ENTRADA', valor: 2000, autorId: associado.id });
    expect(mensalidade.lancamento?.descricao).not.toContain('800002');

    // O comprovante pode ser aberto pelo dono e pelo tesoureiro.
    const link = await http().get(`/api/mensalidades/${id}/comprovante`).set('Authorization', `Bearer ${tesoureiro.token}`).expect(200);
    const arquivo = await fetch(link.body.url);
    expect(arquivo.status).toBe(200);
    await http().get(`/api/mensalidades/${id}/comprovante`).set('Authorization', `Bearer ${outro.token}`).expect(404);
  });

  it('manda para revisão quem reaproveita o comprovante de outra pessoa', async () => {
    const usado = (await base.mensalidade.findFirstOrThrow({ where: { associadoId: associado.id } })).e2eId!;
    const { id } = await minha(outro.token);
    const { linhas } = comprovanteDeHoje({ e2e: usado });
    await enviar(id, outro.token, await pdfComTexto(linhas)).expect(201);
    await comprovantes.processar(id);

    const revisao = await base.mensalidade.findUniqueOrThrow({ where: { id } });
    expect(revisao).toMatchObject({ status: 'EM_REVISAO', motivoRecusa: expect.stringContaining('já foi usado') });

    // O tesoureiro recusa e o associado pode reenviar.
    await http()
      .post(`/api/mensalidades/${id}/recusar`)
      .set('Authorization', `Bearer ${tesoureiro.token}`)
      .send({ motivo: 'Comprovante de outra pessoa' })
      .expect(200);
    expect(await minha(outro.token)).toMatchObject({ status: 'ABERTA', motivoRecusa: 'Comprovante de outra pessoa' });
  });

  it('manda para revisão valor errado, recebedor errado e PDF sem texto', async () => {
    const { id } = await minha(outro.token);
    const casos: [Buffer, string][] = [
      [await pdfComTexto(comprovanteDeHoje({ valor: '15,00' }).linhas), 'diferente da mensalidade'],
      [await pdfComTexto(comprovanteDeHoje({ chave: 'golpe@exemplo.com' }).linhas), 'recebedor'],
      [await pdfSemTexto(), 'não tem texto'],
    ];
    for (const [pdf, motivo] of casos) {
      await enviar(id, outro.token, pdf).expect(201);
      await comprovantes.processar(id);
      expect(await base.mensalidade.findUniqueOrThrow({ where: { id } })).toMatchObject({
        status: 'EM_REVISAO',
        motivoRecusa: expect.stringContaining(motivo),
      });
      // Volta para ABERTA para o próximo caso.
      await http()
        .post(`/api/mensalidades/${id}/recusar`)
        .set('Authorization', `Bearer ${tesoureiro.token}`)
        .send({ motivo: 'Reenvie, por favor' })
        .expect(200);
    }
  });

  it('o tesoureiro aprova manualmente o que ficou em revisão', async () => {
    const { id } = await minha(outro.token);
    await enviar(id, outro.token, await pdfSemTexto()).expect(201);
    await comprovantes.processar(id);

    const fila = await http().get('/api/mensalidades/revisao').set('Authorization', `Bearer ${tesoureiro.token}`).expect(200);
    expect(fila.body.map((m: { id: string }) => m.id)).toContain(id);
    await http().get('/api/mensalidades/revisao').set('Authorization', `Bearer ${outro.token}`).expect(403);

    await http()
      .post(`/api/mensalidades/${id}/aprovar`)
      .set('Authorization', `Bearer ${tesoureiro.token}`)
      .send({ e2eId: 'E00000000202601011200XYZ00000001' })
      .expect(200);
    const paga = await base.mensalidade.findUniqueOrThrow({ where: { id }, include: { lancamento: true } });
    expect(paga).toMatchObject({ status: 'PAGA', tipoBaixa: 'MANUAL' });
    expect(paga.lancamento?.autorId).toBe(tesoureiro.id);
  });

  it('marca inadimplência por mensalidade antiga em aberto e regulariza ao pagar', async () => {
    const devedor = await criarAssociado(app, base, { re: '800004' });
    const antiga = await base.mensalidade.create({
      data: { associadoId: devedor.id, competencia: '2020-01', valor: 2000 },
    });
    const mensalidades = app.get(MensalidadesService);

    await mensalidades.atualizarInadimplencia();
    expect((await base.associado.findUniqueOrThrow({ where: { id: devedor.id } })).situacao).toBe('INADIMPLENTE');

    await base.mensalidade.update({ where: { id: antiga.id }, data: { status: 'EM_REVISAO' } });
    await mensalidades.aprovar(antiga.id, undefined, tesoureiro.id);
    expect((await base.associado.findUniqueOrThrow({ where: { id: devedor.id } })).situacao).toBe('ATIVO');
  });
});
