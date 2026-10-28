import type { NitroFetchOptions } from 'nitropack';
import { FetchError } from 'ofetch';
import { useAuthStore } from '~/stores/auth';

type Opcoes = NitroFetchOptions<string>;

/** $fetch autenticado: renova o token uma vez em caso de 401 e redireciona quando a sessão acabou. */
export function useApi() {
  const auth = useAuthStore();

  function comToken(opcoes: Opcoes): Opcoes {
    const headers = new Headers(opcoes.headers as HeadersInit | undefined);
    if (auth.token) headers.set('Authorization', `Bearer ${auth.token}`);
    return { ...opcoes, headers };
  }

  return async function api<T>(url: string, opcoes: Opcoes = {}): Promise<T> {
    try {
      return (await $fetch(url, comToken(opcoes))) as T;
    } catch (erro) {
      if (!(erro instanceof FetchError)) throw erro;
      if (erro.statusCode === 401 && (await auth.renovar())) {
        return (await $fetch(url, comToken(opcoes))) as T;
      }
      if (erro.statusCode === 401) {
        await navigateTo('/login');
      } else if (erro.data?.codigo === 'TERMO_PENDENTE') {
        await navigateTo('/termo');
      }
      throw erro;
    }
  };
}

export interface ErroApi {
  mensagem: string;
  campos: Record<string, string>;
}

/** Extrai a mensagem e os erros por campo de uma resposta de erro da API. */
export function lerErro(erro: unknown): ErroApi {
  if (erro instanceof FetchError && erro.data) {
    const campos: Record<string, string> = {};
    for (const item of erro.data.erros ?? []) campos[item.campo] = item.mensagem;
    if (erro.statusCode === 409 && erro.data.message === 'Registro duplicado') {
      return { mensagem: 'Já existe um cadastro com esses dados', campos };
    }
    const mensagem = Array.isArray(erro.data.message) ? erro.data.message[0] : erro.data.message;
    return { mensagem: mensagem ?? 'Algo deu errado', campos };
  }
  return { mensagem: 'Sem conexão com o servidor. Tente de novo.', campos: {} };
}
