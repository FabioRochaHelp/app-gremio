// Conferência com o extrato bancário no fechamento (docs/project.md, mecanismo 4): o saldo
// registrado tem que bater com o do banco, e cada mensalidade baixada tem que ter o crédito
// correspondente no extrato. É a garantia final contra comprovante adulterado.

import { parseReais, type Divergencia } from '@gremio/shared';

export interface BaixaParaConferir {
  lancamentoId: string;
  descricao: string;
  valor: number;
  data: Date;
  e2eId: string | null;
}

const REGEX_E2E_GLOBAL = /E\d{20}[A-Za-z0-9]{11}/g;
const REGEX_DATA = /\b(\d{2})\/(\d{2})(?:\/\d{2,4})?\b/;
// Valores sem sinal de menos à frente (débitos costumam vir com "-").
const REGEX_VALOR = /(?<![-\d.,])(\d{1,3}(?:\.\d{3})*,\d{2})(?!\s*D\b)/g;

function diaMes(data: Date): string {
  const sp = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return `${String(sp.getUTCDate()).padStart(2, '0')}/${String(sp.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Créditos do extrato como "dd/mm|centavos", com repetição (dois Pix iguais no mesmo dia contam duas vezes). */
export function creditosDoExtrato(texto: string): string[] {
  const creditos: string[] = [];
  let dataAtual: string | null = null;
  for (const linha of texto.split('\n')) {
    // Extratos costumam escrever a data só na primeira linha de cada dia.
    const data = linha.match(REGEX_DATA);
    if (data) dataAtual = `${data[1]}/${data[2]}`;
    if (!dataAtual || /saldo/i.test(linha)) continue;
    for (const valor of linha.matchAll(REGEX_VALOR)) {
      const centavos = parseReais(valor[1]);
      if (centavos) creditos.push(`${dataAtual}|${centavos}`);
    }
  }
  return creditos;
}

export function conciliar(
  textoExtrato: string,
  baixas: BaixaParaConferir[],
  saldoSistema: number,
  saldoBanco: number,
): Divergencia[] {
  const divergencias: Divergencia[] = [];
  if (saldoSistema !== saldoBanco) {
    divergencias.push({ tipo: 'SALDO', saldoSistema, saldoBanco, diferenca: saldoBanco - saldoSistema });
  }

  if (textoExtrato.replace(/\s/g, '').length < 40) {
    divergencias.push({ tipo: 'EXTRATO_ILEGIVEL' });
    return divergencias;
  }

  const e2eNoExtrato = new Set(textoExtrato.replace(/\s+/g, '').match(REGEX_E2E_GLOBAL) ?? []);
  const creditos = creditosDoExtrato(textoExtrato);

  for (const baixa of baixas) {
    if (baixa.e2eId && e2eNoExtrato.has(baixa.e2eId)) continue;
    // Sem o ID no extrato, procura um crédito de mesmo valor no mesmo dia (e o consome).
    const indice = creditos.indexOf(`${diaMes(baixa.data)}|${baixa.valor}`);
    if (indice >= 0) {
      creditos.splice(indice, 1);
      continue;
    }
    divergencias.push({
      tipo: 'MENSALIDADE_SEM_CREDITO',
      lancamentoId: baixa.lancamentoId,
      descricao: baixa.descricao,
      valor: baixa.valor,
      data: baixa.data.toISOString(),
    });
  }
  return divergencias;
}

