const LADO_MAXIMO = 1600;
const QUALIDADE = 0.82;

/**
 * Reduz fotos grandes do celular antes do envio (a nota continua legível em 1600px).
 * PDFs e imagens pequenas passam direto; se o navegador não conseguir decodificar, envia o original.
 */
export async function comprimirImagem(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith('image/') || arquivo.size < 800 * 1024) return arquivo;
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', QUALIDADE));
    if (!blob || blob.size >= arquivo.size) return arquivo;
    return new File([blob], arquivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return arquivo;
  }
}
