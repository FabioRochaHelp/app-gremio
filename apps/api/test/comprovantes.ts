import { PDFDocument, StandardFonts } from 'pdf-lib';

export const CHAVE_GREMIO = 'gremio@exemplo.com.br';

export async function pdfComTexto(linhas: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([400, 600]);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  linhas.forEach((linha, i) => pagina.drawText(linha, { x: 30, y: 560 - i * 18, size: 11, font: fonte }));
  return Buffer.from(await doc.save());
}

export async function pdfSemTexto(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 600]).drawRectangle({ x: 50, y: 50, width: 100, height: 100 });
  return Buffer.from(await doc.save());
}

/** Comprovante com a data de hoje; o E2E muda a cada chamada. */
export function comprovanteDeHoje({ valor = '20,00', chave = CHAVE_GREMIO, e2e }: { valor?: string; chave?: string; e2e?: string } = {}) {
  const agora = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const dataBr = `${p(agora.getUTCDate())}/${p(agora.getUTCMonth() + 1)}/${agora.getUTCFullYear()}`;
  const carimbo = `${agora.getUTCFullYear()}${p(agora.getUTCMonth() + 1)}${p(agora.getUTCDate())}0900`;
  const id = e2e ?? `E18236120${carimbo}T${Math.random().toString(36).slice(2, 12).padEnd(10, '0')}`;
  return {
    e2e: id,
    linhas: ['Comprovante Pix', 'Valor', `R$ ${valor}`, 'Data', dataBr, 'Destino', `Chave Pix ${chave}`, 'ID da transação', id],
  };
}

/** PNG válido (cinza claro), para testar a incorporação da foto da nota no PDF. */
export function pngSimples(largura = 60, altura = 80): Buffer {
  const { crc32, deflateSync } = require('node:zlib') as typeof import('node:zlib');
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(largura * 3, 230)]);
  const bruto = Buffer.concat(Array.from({ length: altura }, () => linha));
  const bloco = (tipo: string, dados: Buffer) => {
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(corpo) >>> 0);
    return Buffer.concat([tamanho, corpo, crc]);
  };
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(largura, 0);
  cabecalho.writeUInt32BE(altura, 4);
  cabecalho.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', cabecalho),
    bloco('IDAT', deflateSync(bruto)),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}
