export const FILA_COMPROVANTES = 'comprovantes';
export const FILA_AGENDADOS = 'agendados';
export const FILA_NOTIFICACOES = 'notificacoes';
export const FILA_RELATORIOS = 'relatorios';

export const JOB_LER_COMPROVANTE = 'ler';
export const JOB_GERAR_MENSALIDADES = 'gerar-mensalidades';
export const JOB_INADIMPLENCIA = 'inadimplencia';
export const JOB_AVISAR_LANCAMENTO = 'avisar-lancamento';
export const JOB_GERAR_PRESTACAO = 'gerar-prestacao';

export interface DadosLerComprovante {
  mensalidadeId: string;
}

export interface DadosAvisarLancamento {
  lancamentoId: string;
}

export interface DadosGerarPrestacao {
  competencia: string;
}

/** Os processadores rodam na API em dev e em um worker separado em produção (PROCESSAR_FILAS=false na API). */
export function processarFilasNesteProcesso(): boolean {
  return process.env.PROCESSAR_FILAS !== 'false';
}
