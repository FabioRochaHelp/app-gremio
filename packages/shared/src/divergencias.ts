import { formatarCentavos } from './dinheiro';
import type { Divergencia } from './tipos';

/** Texto da divergência, igual no app e no PDF da prestação de contas. */
export function textoDivergencia(d: Divergencia): string {
  switch (d.tipo) {
    case 'SALDO':
      return `Saldo do banco (${formatarCentavos(d.saldoBanco)}) difere do registrado no sistema (${formatarCentavos(d.saldoSistema)}): o banco tem ${formatarCentavos(Math.abs(d.diferenca))} a ${d.diferenca < 0 ? 'menos' : 'mais'}.`;
    case 'MENSALIDADE_SEM_CREDITO': {
      const data = new Date(d.data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      return `${d.descricao} de ${formatarCentavos(d.valor)}, baixada em ${data}, sem crédito correspondente no extrato do banco.`;
    }
    case 'EXTRATO_ILEGIVEL':
      return 'O extrato anexado não tem texto legível; as mensalidades não puderam ser conferidas automaticamente.';
  }
}
