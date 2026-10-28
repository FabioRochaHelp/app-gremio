// BR Code do Pix estático ("copia e cola"), conforme o Manual de Padrões para Iniciação
// do Pix do Banco Central: campos EMV no formato ID (2) + tamanho (2) + valor, com CRC16 no fim.

export interface DadosBrCode {
  chave: string;
  nomeRecebedor: string;
  cidade: string;
  /** Centavos. */
  valor: number;
  /** Identificador da cobrança: até 25 caracteres alfanuméricos. */
  txid: string;
  descricao?: string;
}

function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
}

// O BR Code aceita só ASCII; nomes com acento são convertidos.
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '');
}

/** CRC16/CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF). */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function gerarBrCode(dados: DadosBrCode): string {
  const contaPix =
    campo('00', 'br.gov.bcb.pix') +
    campo('01', dados.chave) +
    (dados.descricao ? campo('02', semAcento(dados.descricao).slice(0, 40)) : '');

  const txid = semAcento(dados.txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

  const semCrc =
    campo('00', '01') +
    campo('26', contaPix) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', (dados.valor / 100).toFixed(2)) +
    campo('58', 'BR') +
    campo('59', semAcento(dados.nomeRecebedor).slice(0, 25)) +
    campo('60', semAcento(dados.cidade).slice(0, 15)) +
    campo('62', campo('05', txid)) +
    '6304';

  return semCrc + crc16(semCrc);
}
