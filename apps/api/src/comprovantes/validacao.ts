// Checagens 2 a 4 da baixa automática (docs/project.md, "Baixa automática pelo comprovante").
// Qualquer falha manda o comprovante para revisão do tesoureiro com o motivo.

import { competenciaDe, formatarCentavos, proximaCompetencia, rotuloCompetencia } from '@gremio/shared';
import type { DadosLidos } from './leitura';

export interface DadosRecebedor {
  chavePix: string;
  cnpj: string | null;
}

export interface Contexto {
  recebedor: DadosRecebedor;
  /** Centavos. */
  valorMensalidade: number;
  competencia: string;
  e2eJaUsado: boolean;
  agora: Date;
}

export type Resultado = { aprovado: true } | { aprovado: false; motivo: string };

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Procura uma sequência de dígitos aceitando a formatação usual (pontos, traços, barras, espaços). */
function contemDigitos(texto: string, digitos: string): boolean {
  if (digitos.length < 8) return false;
  const padrao = digitos.split('').join('[\\s.\\-/()]*');
  return new RegExp(`(?<!\\d)${padrao}(?!\\d)`).test(texto);
}

export function recebedorConfere(texto: string, { chavePix, cnpj }: DadosRecebedor): boolean {
  const normalizado = semAcento(texto);
  const chave = semAcento(chavePix.trim());
  const digitosChave = chave.replace(/\D/g, '');
  const chaveSoDigitos = /^\+?[\d\s.\-/()]+$/.test(chave);

  if (chaveSoDigitos) {
    // CPF, CNPJ ou telefone; o telefone pode aparecer sem o +55.
    if (contemDigitos(normalizado, digitosChave)) return true;
    if (digitosChave.startsWith('55') && contemDigitos(normalizado, digitosChave.slice(2))) return true;
  } else if (normalizado.includes(chave)) {
    return true;
  }
  return cnpj ? contemDigitos(normalizado, cnpj) : false;
}

function competenciasAceitas(competencia: string): string[] {
  // Aceita pagamento antecipado (mês anterior) e atrasado até o mês seguinte.
  const [ano, mes] = competencia.split('-').map(Number);
  const anterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`;
  return [anterior, competencia, proximaCompetencia(competencia)];
}

export function validarComprovante(dados: DadosLidos, texto: string, ctx: Contexto): Resultado {
  const faltando = [
    dados.valor === null && 'valor',
    dados.data === null && 'data',
    dados.e2eId === null && 'ID da transação (E2E)',
  ].filter(Boolean);
  if (faltando.length) {
    return { aprovado: false, motivo: `Não foi possível ler do comprovante: ${faltando.join(', ')}` };
  }

  if (!recebedorConfere(texto, ctx.recebedor)) {
    return { aprovado: false, motivo: 'O recebedor do Pix não é a chave nem o CNPJ do grêmio' };
  }

  if (dados.valor !== ctx.valorMensalidade) {
    return {
      aprovado: false,
      motivo: `Valor pago (${formatarCentavos(dados.valor!)}) diferente da mensalidade (${formatarCentavos(ctx.valorMensalidade)})`,
    };
  }

  const competenciaPagamento = competenciaDe(dados.data!);
  const umDia = 24 * 60 * 60 * 1000;
  if (dados.data!.getTime() > ctx.agora.getTime() + umDia) {
    return { aprovado: false, motivo: 'A data do comprovante está no futuro' };
  }
  if (!competenciasAceitas(ctx.competencia).includes(competenciaPagamento)) {
    return {
      aprovado: false,
      motivo: `Pagamento de ${rotuloCompetencia(competenciaPagamento)} não corresponde à mensalidade de ${rotuloCompetencia(ctx.competencia)}`,
    };
  }

  if (ctx.e2eJaUsado) {
    return { aprovado: false, motivo: 'Este comprovante (ID da transação) já foi usado em outra mensalidade' };
  }

  return { aprovado: true };
}
