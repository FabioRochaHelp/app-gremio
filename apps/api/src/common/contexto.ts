import { AsyncLocalStorage } from 'node:async_hooks';

// Contexto da requisição atual, usado pela auditoria para saber o autor de cada
// alteração sem precisar passá-lo por todas as camadas.
export interface ContextoRequisicao {
  autorId?: string;
}

const armazenamento = new AsyncLocalStorage<ContextoRequisicao>();

export function executarComContexto<T>(contexto: ContextoRequisicao, fn: () => T): T {
  return armazenamento.run(contexto, fn);
}

export function contextoAtual(): ContextoRequisicao | undefined {
  return armazenamento.getStore();
}

export function definirAutor(autorId: string): void {
  const contexto = armazenamento.getStore();
  if (contexto) contexto.autorId = autorId;
}
