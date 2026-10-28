import type { TipoLancamento } from '@prisma/client';

/** Efeito no saldo: entrada soma, saída subtrai, estorno desfaz o lançamento original. */
export function efeito(tipo: TipoLancamento, valor: number, tipoOriginal?: TipoLancamento): number {
  if (tipo === 'ENTRADA') return valor;
  if (tipo === 'SAIDA') return -valor;
  return tipoOriginal === 'ENTRADA' ? -valor : valor;
}
