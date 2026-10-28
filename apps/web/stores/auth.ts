import type { RespostaLogin, UsuarioSessao } from '@gremio/shared';
import { defineStore } from 'pinia';
import { FetchError } from 'ofetch';

// Sem resposta nesse prazo, o app avisa que o servidor está fora em vez de ficar em branco.
const TEMPO_LIMITE_MS = 8000;

// O access token fica só em memória; ao abrir o app, a sessão é retomada pelo
// cookie httpOnly de refresh, que o JavaScript não consegue ler.
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null);
  const usuario = ref<UsuarioSessao | null>(null);
  const iniciado = ref(false);
  /** A API não respondeu (fora do ar ou sem rede); diferente de "não logado". */
  const indisponivel = ref(false);
  let renovando: Promise<boolean> | null = null;

  const tesoureiro = computed(() => usuario.value?.perfil === 'TESOUREIRO');

  function definirSessao(resposta: RespostaLogin) {
    token.value = resposta.accessToken;
    usuario.value = resposta.usuario;
  }

  function limpar() {
    token.value = null;
    usuario.value = null;
  }

  /** Troca o cookie de refresh por um novo access token. Chamadas simultâneas compartilham a mesma requisição. */
  function renovar(): Promise<boolean> {
    renovando ??= $fetch<RespostaLogin>('/api/auth/refresh', { method: 'POST', timeout: TEMPO_LIMITE_MS })
      .then((resposta) => {
        definirSessao(resposta);
        indisponivel.value = false;
        return true;
      })
      .catch((erro) => {
        const status = erro instanceof FetchError ? erro.statusCode : undefined;
        indisponivel.value = !status || status >= 500;
        limpar();
        return false;
      })
      .finally(() => {
        renovando = null;
      });
    return renovando;
  }

  async function iniciar() {
    if (iniciado.value) return;
    await renovar();
    // Se o servidor estava fora, tenta de novo na próxima navegação.
    iniciado.value = !indisponivel.value;
  }

  async function sair() {
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    limpar();
  }

  return { token, usuario, tesoureiro, indisponivel, definirSessao, renovar, iniciar, sair };
});
