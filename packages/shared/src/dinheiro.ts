// Todo valor monetário trafega e é guardado em centavos (inteiro).

const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarCentavos(centavos: number): string {
  return formatador.format(centavos / 100);
}

/** Converte "1.234,56", "1234,56", "R$ 12,00" ou "12.5" em centavos. Retorna null se inválido. */
export function parseReais(texto: string): number | null {
  let limpo = texto.replace(/R\$|\s/g, '');
  if (limpo.includes(',')) {
    limpo = limpo.replace(/\./g, '').replace(',', '.');
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}
