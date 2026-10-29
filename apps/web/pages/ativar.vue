<script setup lang="ts">
import { ativarSchema, type RespostaLogin } from '@gremio/shared';
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const form = reactive({ re: '', codigo: '', senha: '', confirmacao: '' });
const erros = ref<Record<string, string>>({});
const erro = ref('');
const enviando = ref(false);

async function ativar() {
  erro.value = '';
  erros.value = {};
  if (form.senha !== form.confirmacao) {
    erros.value = { confirmacao: 'As senhas não conferem' };
    return;
  }
  const dados = ativarSchema.safeParse(form);
  if (!dados.success) {
    for (const issue of dados.error.issues) erros.value[String(issue.path[0])] = issue.message;
    return;
  }
  enviando.value = true;
  try {
    auth.definirSessao(await $fetch<RespostaLogin>('/api/auth/ativar', { method: 'POST', body: dados.data }));
    await navigateTo('/termo');
  } catch (e) {
    erro.value = lerErro(e).mensagem;
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div>
    <h1>Ativar acesso</h1>
    <p class="suave">
      No primeiro acesso, digite a palavra <strong>ACEITAR</strong> no código. Se pediu para redefinir a senha,
      use o código de 8 letras que o tesoureiro passou para você. Os códigos valem por 7 dias.
    </p>
    <form class="cartao" @submit.prevent="ativar">
      <div v-if="erro" class="alerta alerta-erro" role="alert">{{ erro }}</div>
      <div class="campo">
        <label for="re">RE</label>
        <input id="re" v-model="form.re" inputmode="numeric" autocomplete="username" required />
        <span v-if="erros.re" class="erro-campo">{{ erros.re }}</span>
      </div>
      <div class="campo">
        <label for="codigo">Código</label>
        <input
          id="codigo"
          v-model="form.codigo"
          autocapitalize="characters"
          autocomplete="one-time-code"
          maxlength="8"
          required
        />
        <span v-if="erros.codigo" class="erro-campo">{{ erros.codigo }}</span>
      </div>
      <div class="campo">
        <label for="senha">Crie uma senha</label>
        <input id="senha" v-model="form.senha" type="password" autocomplete="new-password" minlength="8" required />
        <span v-if="erros.senha" class="erro-campo">{{ erros.senha }}</span>
      </div>
      <div class="campo">
        <label for="confirmacao">Repita a senha</label>
        <input id="confirmacao" v-model="form.confirmacao" type="password" autocomplete="new-password" required />
        <span v-if="erros.confirmacao" class="erro-campo">{{ erros.confirmacao }}</span>
      </div>
      <button class="botao botao-largo" :disabled="enviando">{{ enviando ? 'Ativando…' : 'Ativar' }}</button>
    </form>
    <p class="suave"><NuxtLink to="/login">Já tenho senha</NuxtLink></p>
  </div>
</template>
