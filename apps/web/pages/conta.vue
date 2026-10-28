<script setup lang="ts">
import { trocarSenhaSchema, type RespostaLogin } from '@gremio/shared';
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const api = useApi();
const form = reactive({ senhaAtual: '', novaSenha: '' });
const erro = ref('');
const ok = ref(false);
const enviando = ref(false);

async function trocar() {
  erro.value = '';
  ok.value = false;
  const dados = trocarSenhaSchema.safeParse(form);
  if (!dados.success) {
    erro.value = dados.error.issues[0].message;
    return;
  }
  enviando.value = true;
  try {
    auth.definirSessao(await api<RespostaLogin>('/api/auth/senha', { method: 'POST', body: dados.data }));
    form.senhaAtual = '';
    form.novaSenha = '';
    ok.value = true;
  } catch (e) {
    erro.value = lerErro(e).mensagem;
  } finally {
    enviando.value = false;
  }
}

async function sair() {
  await auth.sair();
  await navigateTo('/login');
}
</script>

<template>
  <div>
    <h1>Minha conta</h1>
    <div class="cartao">
      <strong>{{ auth.usuario?.nome }}</strong>
      <div class="suave">RE {{ auth.usuario?.re }} · {{ auth.tesoureiro ? 'Tesoureiro' : 'Associado' }}</div>
    </div>

    <NuxtLink to="/instalar" class="cartao atalho">Instalar o app e ligar os avisos →</NuxtLink>

    <h2>Trocar senha</h2>
    <form class="cartao" @submit.prevent="trocar">
      <div v-if="erro" class="alerta alerta-erro" role="alert">{{ erro }}</div>
      <div v-if="ok" class="alerta alerta-ok">Senha alterada. Outros aparelhos precisarão entrar de novo.</div>
      <div class="campo">
        <label for="atual">Senha atual</label>
        <input id="atual" v-model="form.senhaAtual" type="password" autocomplete="current-password" required />
      </div>
      <div class="campo">
        <label for="nova">Nova senha</label>
        <input id="nova" v-model="form.novaSenha" type="password" autocomplete="new-password" minlength="8" required />
      </div>
      <button class="botao" :disabled="enviando">Salvar</button>
    </form>

    <button class="botao botao-secundario botao-largo" @click="sair">Sair</button>
  </div>
</template>

<style scoped>
.atalho {
  display: block;
  color: var(--cor-marca);
  font-weight: 600;
  text-decoration: none;
}
</style>
