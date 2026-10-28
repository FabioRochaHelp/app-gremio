import { PDFParse } from 'pdf-parse';

export function pareceUmPdf(conteudo: Buffer): boolean {
  return conteudo.subarray(0, 5).toString('latin1') === '%PDF-';
}

export async function extrairTexto(conteudo: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(conteudo) });
  try {
    const resultado = await parser.getText();
    return resultado.text;
  } finally {
    await parser.destroy();
  }
}
