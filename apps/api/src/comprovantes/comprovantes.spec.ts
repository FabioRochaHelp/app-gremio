import { lerComprovante } from './leitura';
import { Contexto, recebedorConfere, validarComprovante } from './validacao';

// Textos no formato que o pdf-parse devolve, com dados fictícios. Ao receber comprovantes
// reais de um banco, acrescente o texto anonimizado aqui antes de ajustar o leitor.
const COMPROVANTE_TIPICO = `Comprovante de transferência
Pix enviado
Valor
R$ 20,00
Data e hora
27/10/2026 - 14:32
Destino
Nome GREMIO DA UNIDADE
CNPJ 12.345.678/0001-90
Instituição BANCO EXEMPLO S.A.
Chave Pix gremio@exemplo.com.br
Origem
Nome FULANO DE TAL
CPF ***.456.789-**
Instituição NU PAGAMENTOS - IP
ID da transação
E18236120202610271732s0a1B2c3D4e`;

const COMPROVANTE_EXTENSO = `Transferência realizada
Você transferiu R$ 20,00
para Grêmio da Unidade
Realizada em 3 de novembro de 2026 às 09:15
Chave: (11) 98765-4321
Código de autenticação
E00416968202611031215
AbCdEfGh123`;

const contexto: Contexto = {
  recebedor: { chavePix: 'gremio@exemplo.com.br', cnpj: '12345678000190' },
  valorMensalidade: 2000,
  competencia: '2026-10',
  e2eJaUsado: false,
  agora: new Date('2026-10-28T12:00:00Z'),
};

describe('leitura do comprovante', () => {
  it('lê valor, data, E2E e banco de um comprovante típico', () => {
    const dados = lerComprovante(COMPROVANTE_TIPICO);
    expect(dados.valor).toBe(2000);
    expect(dados.e2eId).toBe('E18236120202610271732s0a1B2c3D4e');
    expect(dados.banco).toBe('Nubank');
    expect(dados.data?.toISOString()).toBe('2026-10-27T17:32:00.000Z');
  });

  it('lê data por extenso e E2E quebrado em duas linhas', () => {
    const dados = lerComprovante(COMPROVANTE_EXTENSO);
    expect(dados.valor).toBe(2000);
    expect(dados.e2eId).toBe('E00416968202611031215AbCdEfGh123');
    expect(dados.banco).toBe('Inter');
    expect(dados.data?.toISOString()).toBe('2026-11-03T12:15:00.000Z');
  });

  it('não chuta o valor quando há vários sem rótulo', () => {
    expect(lerComprovante('R$ 20,00\nR$ 1.500,00').valor).toBeNull();
  });

  it('usa a data do E2E quando o texto não tem data', () => {
    const dados = lerComprovante('Valor R$ 20,00\nE18236120202610271732s0a1B2c3D4e');
    expect(dados.data?.toISOString()).toBe('2026-10-27T17:32:00.000Z');
  });

  it('ignora datas impossíveis', () => {
    expect(lerComprovante('Data 31/02/2026').data).toBeNull();
  });
});

describe('checagens', () => {
  const dados = lerComprovante(COMPROVANTE_TIPICO);

  it('aprova um comprovante correto', () => {
    expect(validarComprovante(dados, COMPROVANTE_TIPICO, contexto)).toEqual({ aprovado: true });
  });

  it('recusa quando falta informação', () => {
    const r = validarComprovante({ ...dados, e2eId: null }, COMPROVANTE_TIPICO, contexto);
    expect(r).toMatchObject({ aprovado: false, motivo: expect.stringContaining('ID da transação') });
  });

  it('recusa recebedor diferente', () => {
    const outro = { chavePix: 'outra@chave.com', cnpj: '99888777000166' };
    const r = validarComprovante(dados, COMPROVANTE_TIPICO, { ...contexto, recebedor: outro });
    expect(r).toMatchObject({ aprovado: false, motivo: expect.stringContaining('recebedor') });
  });

  it('recusa valor diferente', () => {
    const r = validarComprovante(dados, COMPROVANTE_TIPICO, { ...contexto, valorMensalidade: 2500 });
    expect(r).toMatchObject({ aprovado: false, motivo: expect.stringContaining('R$') });
  });

  it('recusa pagamento fora da competência', () => {
    const r = validarComprovante(dados, COMPROVANTE_TIPICO, {
      ...contexto,
      competencia: '2026-07',
      agora: new Date('2026-10-28T12:00:00Z'),
    });
    expect(r).toMatchObject({ aprovado: false, motivo: expect.stringContaining('não corresponde') });
  });

  it('aceita pagamento atrasado até o mês seguinte', () => {
    const r = validarComprovante(dados, COMPROVANTE_TIPICO, { ...contexto, competencia: '2026-09' });
    expect(r).toEqual({ aprovado: true });
  });

  it('recusa data no futuro', () => {
    const r = validarComprovante(dados, COMPROVANTE_TIPICO, { ...contexto, agora: new Date('2026-10-20T12:00:00Z') });
    expect(r).toMatchObject({ aprovado: false, motivo: expect.stringContaining('futuro') });
  });

  it('recusa E2E já usado', () => {
    const r = validarComprovante(dados, COMPROVANTE_TIPICO, { ...contexto, e2eJaUsado: true });
    expect(r).toMatchObject({ aprovado: false, motivo: expect.stringContaining('já foi usado') });
  });
});

describe('recebedor', () => {
  it('encontra CNPJ formatado ou não', () => {
    expect(recebedorConfere('CNPJ 12.345.678/0001-90', { chavePix: 'x@y.com', cnpj: '12345678000190' })).toBe(true);
    expect(recebedorConfere('CNPJ 12345678000190', { chavePix: 'x@y.com', cnpj: '12345678000190' })).toBe(true);
  });

  it('encontra chave telefone com ou sem +55', () => {
    const recebedor = { chavePix: '+5511987654321', cnpj: null };
    expect(recebedorConfere('Chave: (11) 98765-4321', recebedor)).toBe(true);
    expect(recebedorConfere('Chave: +55 11 98765-4321', recebedor)).toBe(true);
  });

  it('não confunde com número maior que contém os dígitos', () => {
    expect(recebedorConfere('Conta 9123456780001901', { chavePix: 'x@y.com', cnpj: '12345678000190' })).toBe(false);
  });

  it('compara e-mail sem diferenciar maiúsculas e acentos', () => {
    expect(recebedorConfere('Chave GREMIO@EXEMPLO.COM.BR', { chavePix: 'gremio@exemplo.com.br', cnpj: null })).toBe(
      true,
    );
  });
});
