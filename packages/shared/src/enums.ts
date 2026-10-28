// Espelham os enums do schema Prisma (apps/api/prisma/schema.prisma).

export const Perfil = {
  ASSOCIADO: 'ASSOCIADO',
  TESOUREIRO: 'TESOUREIRO',
} as const;
export type Perfil = (typeof Perfil)[keyof typeof Perfil];

export const Situacao = {
  ATIVO: 'ATIVO',
  INADIMPLENTE: 'INADIMPLENTE',
  ISENTO: 'ISENTO',
} as const;
export type Situacao = (typeof Situacao)[keyof typeof Situacao];

export const StatusMensalidade = {
  ABERTA: 'ABERTA',
  EM_ANALISE: 'EM_ANALISE',
  EM_REVISAO: 'EM_REVISAO',
  PAGA: 'PAGA',
  ISENTA: 'ISENTA',
} as const;
export type StatusMensalidade = (typeof StatusMensalidade)[keyof typeof StatusMensalidade];

export const TipoBaixa = {
  AUTOMATICA: 'AUTOMATICA',
  MANUAL: 'MANUAL',
} as const;
export type TipoBaixa = (typeof TipoBaixa)[keyof typeof TipoBaixa];

export const TipoLancamento = {
  ENTRADA: 'ENTRADA',
  SAIDA: 'SAIDA',
  ESTORNO: 'ESTORNO',
} as const;
export type TipoLancamento = (typeof TipoLancamento)[keyof typeof TipoLancamento];

export const ROTULO_STATUS_MENSALIDADE: Record<StatusMensalidade, string> = {
  ABERTA: 'Em aberto',
  EM_ANALISE: 'Lendo comprovante',
  EM_REVISAO: 'Com o tesoureiro',
  PAGA: 'Paga',
  ISENTA: 'Isenta',
};
