// Formatos aceitos para notas, recibos e comprovantes, reconhecidos pelos primeiros bytes.
export function tipoDoArquivo(conteudo: Buffer): { extensao: string; contentType: string } | null {
  const inicio = conteudo.subarray(0, 12);
  if (inicio.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { extensao: 'jpg', contentType: 'image/jpeg' };
  if (inicio.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { extensao: 'png', contentType: 'image/png' };
  if (inicio.toString('latin1', 0, 4) === 'RIFF' && inicio.toString('latin1', 8, 12) === 'WEBP') {
    return { extensao: 'webp', contentType: 'image/webp' };
  }
  if (inicio.toString('latin1', 4, 8) === 'ftyp' && /hei[cx]|mif1/.test(inicio.toString('latin1', 8, 12))) {
    return { extensao: 'heic', contentType: 'image/heic' };
  }
  if (inicio.toString('latin1', 0, 5) === '%PDF-') return { extensao: 'pdf', contentType: 'application/pdf' };
  return null;
}

/** Data escolhida no formulário (dia, sem hora) vira meio-dia em São Paulo; o dia de hoje usa a hora atual. */
export function dataDoLancamento(dia: string | undefined, agora: Date): Date {
  if (!dia) return agora;
  const hojeSp = new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (dia === hojeSp) return agora;
  return new Date(`${dia}T15:00:00.000Z`);
}
