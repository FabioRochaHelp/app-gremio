import { createHash, randomInt } from 'node:crypto';

// Sem caracteres ambíguos (0/O, 1/I/L) para facilitar digitar no celular.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const VALIDADE_DIAS = 7;

/** Sem `codigoFixo`, sorteia um código de 8 caracteres. */
export function gerarCodigoConvite(codigoFixo?: string): { codigo: string; hash: string; expiraEm: Date } {
  let codigo = codigoFixo ?? '';
  if (!codigoFixo) for (let i = 0; i < 8; i++) codigo += ALFABETO[randomInt(ALFABETO.length)];
  const expiraEm = new Date(Date.now() + VALIDADE_DIAS * 24 * 60 * 60 * 1000);
  return { codigo, hash: hashConvite(codigo), expiraEm };
}

// Guardamos só o hash: um vazamento do banco não entrega convites válidos.
export function hashConvite(codigo: string): string {
  return createHash('sha256').update(codigo.toUpperCase()).digest('hex');
}
