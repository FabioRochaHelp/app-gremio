// Competência é o mês de referência no formato "YYYY-MM", no fuso de São Paulo.

export const FUSO = 'America/Sao_Paulo';
export const REGEX_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

export function competenciaDe(data: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(data);
  const ano = partes.find((p) => p.type === 'year')!.value;
  const mes = partes.find((p) => p.type === 'month')!.value;
  return `${ano}-${mes}`;
}

export function proximaCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number);
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`;
}

export function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number);
  const nome = new Date(Date.UTC(ano, mes - 1, 15)).toLocaleDateString('pt-BR', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${nome}/${ano}`;
}
