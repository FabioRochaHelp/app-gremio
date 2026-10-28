import { conciliar, creditosDoExtrato, type BaixaParaConferir } from './conciliacao';

// Extrato fictício no formato que o pdf-parse costuma devolver.
const EXTRATO = `Extrato de conta corrente - Outubro/2026
Data Lançamento Valor
03/10/2026 Pix recebido FULANO DE TAL 20,00
Pix recebido CICLANO SOUZA 20,00
05/10/2026 Pix enviado PADARIA -35,90
Pix recebido E18236120202610081200abcDEF12345 20,00
10/10/2026 Tarifa 2,50 D
Saldo do dia 1.234,56
`;

const baixa = (dados: Partial<BaixaParaConferir>): BaixaParaConferir => ({
  lancamentoId: 'l1',
  descricao: 'Mensalidade de outubro/2026',
  valor: 2000,
  data: new Date('2026-10-03T15:00:00Z'),
  e2eId: null,
  ...dados,
});

describe('créditos do extrato', () => {
  it('pega créditos, herda a data do dia e ignora débitos, tarifas e saldo', () => {
    expect(creditosDoExtrato(EXTRATO)).toEqual(['03/10|2000', '03/10|2000', '05/10|2000']);
  });
});

describe('conciliação', () => {
  it('sem divergências quando saldo bate e cada baixa tem crédito', () => {
    const baixas = [baixa({ lancamentoId: 'a' }), baixa({ lancamentoId: 'b' })];
    expect(conciliar(EXTRATO, baixas, 5000, 5000)).toEqual([]);
  });

  it('acha a baixa pelo E2E mesmo em outro dia', () => {
    const r = conciliar(
      EXTRATO,
      [baixa({ e2eId: 'E18236120202610081200abcDEF12345', data: new Date('2026-10-20T15:00:00Z') })],
      0,
      0,
    );
    expect(r).toEqual([]);
  });

  it('cada crédito só confirma uma baixa', () => {
    const baixas = ['a', 'b', 'c'].map((id) => baixa({ lancamentoId: id }));
    const r = conciliar(EXTRATO, baixas, 0, 0);
    expect(r).toEqual([expect.objectContaining({ tipo: 'MENSALIDADE_SEM_CREDITO', lancamentoId: 'c' })]);
  });

  it('aponta mensalidade baixada sem crédito no banco e diferença de saldo', () => {
    const r = conciliar(EXTRATO, [baixa({ data: new Date('2026-10-15T15:00:00Z') })], 10000, 9800);
    expect(r).toEqual([
      { tipo: 'SALDO', saldoSistema: 10000, saldoBanco: 9800, diferenca: -200 },
      expect.objectContaining({ tipo: 'MENSALIDADE_SEM_CREDITO', valor: 2000 }),
    ]);
  });

  it('extrato sem texto vira divergência em vez de aprovar tudo', () => {
    expect(conciliar('   ', [baixa({})], 0, 0)).toEqual([{ tipo: 'EXTRATO_ILEGIVEL' }]);
  });
});
