<script setup lang="ts">
import { loginSchema, type RespostaLogin } from '@gremio/shared';
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const re = ref('');
const senha = ref('');
const erro = ref('');
const enviando = ref(false);

async function entrar() {
  erro.value = '';
  const dados = loginSchema.safeParse({ re: re.value, senha: senha.value });
  if (!dados.success) {
    erro.value = dados.error.issues[0].message;
    return;
  }
  enviando.value = true;
  try {
    auth.definirSessao(await $fetch<RespostaLogin>('/api/auth/login', { method: 'POST', body: dados.data }));
    await navigateTo(auth.usuario?.termoAceito ? '/' : '/termo');
  } catch (e) {
    erro.value = lerErro(e).mensagem;
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div>
    <h1>Entrar</h1>
    <form class="cartao" @submit.prevent="entrar">
      <div v-if="erro" class="alerta alerta-erro" role="alert">{{ erro }}</div>
      <div class="campo">
        <label for="re">RE</label>
        <input id="re" v-model="re" inputmode="numeric" autocomplete="username" required />
      </div>
      <div class="campo">
        <label for="senha">Senha</label>
        <input id="senha" v-model="senha" type="password" autocomplete="current-password" required />
      </div>
      <button class="botao botao-largo" :disabled="enviando">{{ enviando ? 'Entrando…' : 'Entrar' }}</button>
    </form>
    <p class="suave">
      Primeiro acesso ou esqueceu a senha? Peça um código ao tesoureiro e
      <NuxtLink to="/ativar">ative seu acesso</NuxtLink>.
    </p>
  </div>
</template>
