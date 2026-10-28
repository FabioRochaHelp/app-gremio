<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const tentando = ref(false);

async function tentarDeNovo() {
  tentando.value = true;
  await auth.iniciar();
  // Recarrega para a página passar de novo pelas regras de login e termo.
  if (!auth.indisponivel) reloadNuxtApp({ force: true });
  tentando.value = false;
}
</script>

<template>
  <div class="app">
    <header class="topo">
      <NuxtLink to="/" class="marca">
        <img src="/icone.svg" alt="" width="28" height="28" />
        Grêmio
      </NuxtLink>
      <span v-if="auth.usuario" class="usuario">{{ auth.usuario.nome }}</span>
    </header>

    <main class="conteudo">
      <div v-if="auth.indisponivel" class="cartao" role="alert">
        <h1>Servidor indisponível</h1>
        <p class="suave">Não foi possível falar com o servidor do grêmio. Confira sua conexão e tente de novo.</p>
        <button class="botao" :disabled="tentando" @click="tentarDeNovo">
          {{ tentando ? 'Tentando…' : 'Tentar de novo' }}
        </button>
      </div>
      <slot v-else />
    </main>

    <nav v-if="auth.usuario?.termoAceito" class="navegacao" aria-label="Principal">
      <NuxtLink to="/">Painel</NuxtLink>
      <NuxtLink to="/extrato" :class="{ ativo: $route.path.startsWith('/extrato') }">Extrato</NuxtLink>
      <NuxtLink to="/mensalidades">Mensalidade</NuxtLink>
      <NuxtLink v-if="auth.tesoureiro" to="/tesouraria" :class="{ ativo: $route.path.startsWith('/tesouraria') }">
        Tesouraria
      </NuxtLink>
      <NuxtLink to="/conta">Conta</NuxtLink>
    </nav>
  </div>
</template>

<style scoped>
.app {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.topo {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: calc(env(safe-area-inset-top, 0px) + 0.6rem) 1rem 0.6rem;
  background: var(--cor-marca);
  color: #fff;
}

.marca {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #fff;
  font-weight: 700;
  text-decoration: none;
}

.marca img {
  border-radius: 6px;
  outline: 1px solid rgb(255 255 255 / 0.4);
}

.usuario {
  font-size: 0.85rem;
  opacity: 0.9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conteudo {
  flex: 1;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 1.25rem 1rem 6rem;
}

.navegacao {
  position: fixed;
  inset: auto 0 0;
  display: flex;
  justify-content: space-around;
  background: var(--cor-superficie);
  border-top: 1px solid var(--cor-borda);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.navegacao a {
  flex: 1;
  min-width: 0;
  text-align: center;
  padding: 0.85rem 0.1rem;
  font-size: 0.78rem;
  color: var(--cor-texto-suave);
  text-decoration: none;
}

.navegacao a.router-link-exact-active,
.navegacao a.ativo {
  color: var(--cor-marca);
  font-weight: 700;
  box-shadow: inset 0 3px 0 var(--cor-marca);
}
</style>
