// Etapa 1 da baixa automática: extrair valor, data e ID E2E do texto do comprovante.
// Os comprovantes de Pix dos bancos usam rótulos parecidos ("Valor", "Data", "ID da
// transação"), então um leitor genérico cobre a maioria. Um banco com layout diferente
// ganha regras próprias em REGRAS_POR_BANCO, sempre com um teste usando um texto real anonimizado.

import { parseReais } from '@gremio/shared';

export interface DadosLidos {
  banco: string | null;
  /** Centavos. */
  valor: number | null;
  data: Date | null;
  e2eId: string | null;
}

// O ISPB no início do E2E identifica a instituição de quem pagou.
const BANCOS_POR_ISPB: Record<string, string> = {
  '00000000': 'Banco do Brasil',
  '00360305': 'Caixa',
  '60701190': 'Itaú',
  '60746948': 'Bradesco',
  '90400888': 'Santander',
  '18236120': 'Nubank',
  '00416968': 'Inter',
  '10573521': 'Mercado Pago',
  '22896431': 'PicPay',
  '31872495': 'C6 Bank',
  '02038232': 'Sicoob',
  '01181521': 'Sicredi',
};

interface RegrasBanco {
  valor?: (texto: string) => number | null;
  data?: (texto: string) => Date | null;
}

const REGRAS_POR_BANCO: Record<string, RegrasBanco> = {};

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const REGEX_E2E_NO_TEXTO = /E\d{20}[A-Za-z0-9]{11}/;
const REGEX_VALOR = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g;
const REGEX_DATA_NUMERICA = /\b(\d{2})\/(\d{2})\/(\d{4})(?:\D{1,6}(\d{2}):(\d{2}))?/g;
const REGEX_DATA_EXTENSO = /\b(\d{1,2})(?:\s+de)?\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?:\s+de)?\s+(\d{4})(?:\D{1,6}(\d{2}):(\d{2}))?/gi;

function normalizar(texto: string): string {
  return texto.replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
}

/** Data e hora locais de São Paulo (UTC-3, sem horário de verão desde 2019). */
function dataSaoPaulo(ano: number, mes: number, dia: number, hora = 12, minuto = 0): Date | null {
  const dia0 = new Date(Date.UTC(ano, mes - 1, dia));
  if (dia0.getUTCFullYear() !== ano || dia0.getUTCMonth() !== mes - 1 || dia0.getUTCDate() !== dia) return null;
  return new Date(Date.UTC(ano, mes - 1, dia, hora + 3, minuto));
}

export function lerE2e(texto: string): string | null {
  // Alguns PDFs quebram o ID em duas linhas; sem espaços ele volta a ficar inteiro.
  const encontrado = texto.replace(/\s+/g, '').match(REGEX_E2E_NO_TEXTO);
  return encontrado?.[0] ?? null;
}

export function dataDoE2e(e2e: string): Date {
  const [ano, mes, dia, hora, minuto] = [
    e2e.slice(9, 13),
    e2e.slice(13, 15),
    e2e.slice(15, 17),
    e2e.slice(17, 19),
    e2e.slice(19, 21),
  ].map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, hora, minuto));
}

export function lerValor(texto: string): number | null {
  const linhas = texto.split('\n');
  // Preferência: valor na mesma linha do rótulo "Valor" ou na linha seguinte.
  for (let i = 0; i < linhas.length; i++) {
    if (!/\bvalor\b/i.test(linhas[i]) || /tarifa|saldo|limite/i.test(linhas[i])) continue;
    const trecho = `${linhas[i]} ${linhas[i + 1] ?? ''}`;
    const achado = [...trecho.matchAll(REGEX_VALOR)][0];
    if (achado) return parseReais(achado[1]);
  }
  // Sem rótulo: só aceita se todos os valores do comprovante forem iguais.
  const valores = [...new Set([...texto.matchAll(REGEX_VALOR)].map((m) => parseReais(m[1])))];
  return valores.length === 1 ? valores[0] : null;
}

function datasNoTexto(texto: string): Date[] {
  const datas: Date[] = [];
  for (const m of texto.matchAll(REGEX_DATA_NUMERICA)) {
    const data = dataSaoPaulo(+m[3], +m[2], +m[1], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
    if (data) datas.push(data);
  }
  for (const m of texto.matchAll(REGEX_DATA_EXTENSO)) {
    const data = dataSaoPaulo(+m[3], MESES[m[2].toLowerCase()], +m[1], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
    if (data) datas.push(data);
  }
  return datas;
}

export function lerData(texto: string, e2e: string | null): Date | null {
  const linhas = texto.split('\n');
  for (let i = 0; i < linhas.length; i++) {
    if (!/\bdata\b|realizad[oa] em|efetuad[oa] em/i.test(linhas[i])) continue;
    const [data] = datasNoTexto(`${linhas[i]} ${linhas[i + 1] ?? ''}`);
    if (data) return data;
  }
  const [primeira] = datasNoTexto(texto);
  if (primeira) return primeira;
  return e2e ? dataDoE2e(e2e) : null;
}

export function lerComprovante(textoOriginal: string): DadosLidos {
  const texto = normalizar(textoOriginal);
  const e2eId = lerE2e(texto);
  const banco = e2eId ? (BANCOS_POR_ISPB[e2eId.slice(1, 9)] ?? null) : null;
  const regras = (banco && REGRAS_POR_BANCO[banco]) || {};
  return {
    banco,
    e2eId,
    valor: regras.valor?.(texto) ?? lerValor(texto),
    data: regras.data?.(texto) ?? lerData(texto, e2eId),
  };
}
