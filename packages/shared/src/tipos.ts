import type { Perfil, Situacao, StatusMensalidade, TipoBaixa, TipoLancamento } from './enums';

// Formatos de resposta da API consumidos pelo PWA.

export interface UsuarioSessao {
  id: string;
  nome: string;
  re: string;
  perfil: Perfil;
  termoAceito: boolean;
}

export interface RespostaLogin {
  accessToken: string;
  usuario: UsuarioSessao;
}

export interface AssociadoDto {
  id: string;
  nome: string;
  re: string;
  posto: string;
  unidade: string;
  /** 55 + DDD + número, só dígitos. */
  celular: string | null;
  perfil: Perfil;
  situacao: Situacao;
  ativado: boolean;
  criadoEm: string;
}

export interface ConviteDto {
  codigo: string;
  expiraEm: string;
}

export interface ConfigDto {
  valorMensalidade: number;
  chavePix: string;
  cnpj: string | null;
  nomeRecebedor: string;
  cidade: string;
}

export interface CategoriaDto {
  id: string;
  nome: string;
  ativa: boolean;
}

export interface AssociadoResumo {
  id: string;
  nome: string;
  re: string;
  posto: string;
}

/** O que a leitura automática conseguiu tirar do comprovante. */
export interface DadosExtraidos {
  banco: string | null;
  valor: number | null;
  data: string | null;
  e2eId: string | null;
  recebedorConfere: boolean;
}

export interface MensalidadeDto {
  id: string;
  competencia: string;
  valor: number;
  status: StatusMensalidade;
  tipoBaixa: TipoBaixa | null;
  motivoRecusa: string | null;
  temComprovante: boolean;
  atualizadoEm: string;
}

export interface MensalidadeTesourariaDto extends MensalidadeDto {
  associado: AssociadoResumo;
  dadosExtraidos: DadosExtraidos | null;
}

export interface CobrancaPixDto {
  copiaECola: string;
  /** QR Code em SVG como data URL, pronto para um <img>. */
  qrCode: string;
  valor: number;
  chavePix: string;
  nomeRecebedor: string;
}

export interface ArquivoDto {
  url: string;
}

export interface PessoaResumo {
  nome: string;
  posto: string;
}

export interface LancamentoDto {
  id: string;
  tipo: TipoLancamento;
  valor: number;
  /** Efeito no saldo, em centavos: positivo soma, negativo subtrai. Estorno inverte o original. */
  efeito: number;
  descricao: string;
  categoria: { id: string; nome: string } | null;
  data: string;
  competencia: string;
  criadoEm: string;
  /** Nulo quando o autor é restrito (baixa de mensalidade vista por associado). */
  autor: PessoaResumo | null;
  /** Entrada de mensalidade: comprovante e pagador são restritos ao tesoureiro. */
  deMensalidade: boolean;
  /** O usuário atual pode abrir o comprovante. */
  comprovanteVisivel: boolean;
  motivoEstorno: string | null;
  estornoDe: { id: string; tipo: TipoLancamento; descricao: string } | null;
  estornadoPor: { id: string; motivo: string | null; data: string } | null;
}

export interface TotaisMes {
  competencia: string;
  entradas: number;
  saidas: number;
}

export interface PainelDto {
  saldo: number;
  mesAtual: TotaisMes;
  meses: TotaisMes[];
  categorias: { nome: string; total: number }[];
  ultimos: LancamentoDto[];
}

/** Diferenças achadas na conferência com o extrato do banco, mostradas na prestação de contas. */
export type Divergencia =
  | { tipo: 'SALDO'; saldoSistema: number; saldoBanco: number; diferenca: number }
  | { tipo: 'MENSALIDADE_SEM_CREDITO'; lancamentoId: string; descricao: string; valor: number; data: string }
  | { tipo: 'EXTRATO_ILEGIVEL' };

export interface FechamentoDto {
  competencia: string;
  saldoSistema: number;
  saldoBanco: number;
  divergencias: Divergencia[];
  pdfPronto: boolean;
  fechadoPor: PessoaResumo;
  fechadoEm: string;
}

export interface PreviaFechamentoDto {
  competencia: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  saldoSistema: number;
  /** Comprovantes ainda sendo lidos ou em revisão: o ideal é resolvê-los antes de fechar. */
  mensalidadesPendentes: number;
  jaFechado: boolean;
}
