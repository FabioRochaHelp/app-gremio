import { crc16, gerarBrCode } from './brcode';

describe('BR Code Pix', () => {
  it('calcula o CRC16/CCITT-FALSE de referência', () => {
    // Vetor de teste clássico do CRC-16/CCITT-FALSE.
    expect(crc16('123456789')).toBe('29B1');
  });

  it('confere com o exemplo do manual do Banco Central', () => {
    // Exemplo de QR estático do Manual de Padrões para Iniciação do Pix (sem valor, txid ***).
    const esperado =
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D';
    const semCrc = esperado.slice(0, -4);
    expect(crc16(semCrc)).toBe('1D3D');
  });

  it('monta os campos com valor, recebedor e txid', () => {
    const codigo = gerarBrCode({
      chave: 'gremio@exemplo.com.br',
      nomeRecebedor: 'Grêmio da Unidade',
      cidade: 'São Paulo',
      valor: 2000,
      txid: 'MENS-2026-10-abc',
    });
    expect(codigo).toContain('0014br.gov.bcb.pix0121gremio@exemplo.com.br');
    expect(codigo).toContain('540520.00');
    expect(codigo).toContain('5917Gremio da Unidade');
    expect(codigo).toContain('6009Sao Paulo');
    expect(codigo).toContain('62170513MENS202610abc');
    expect(crc16(codigo.slice(0, -4))).toBe(codigo.slice(-4));
  });
});
