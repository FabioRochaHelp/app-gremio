<script setup lang="ts">
import type { UsuarioSessao } from '@gremio/shared';
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const api = useApi();
const ciente = ref(false);
const erro = ref('');
const enviando = ref(false);

async function aceitar() {
  enviando.value = true;
  erro.value = '';
  try {
    auth.usuario = await api<UsuarioSessao>('/api/auth/termo', { method: 'POST' });
    // Primeiro acesso: orienta a instalação, sem a qual o iPhone não recebe avisos.
    await navigateTo(estaInstalado() ? '/' : '/instalar');
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
    <h1>Termo de uso</h1>
    <!-- Texto provisório: revisar com a diretoria do grêmio antes do lançamento. -->
    <div class="cartao termo">
      <h2>Adesão voluntária</h2>
      <p>
        O grêmio é uma associação privada, separada da estrutura do Estado. Participar é opcional: não há desconto em
        folha nem cobrança por via hierárquica, e você pode deixar de contribuir quando quiser.
      </p>

      <h2>Quais dados guardamos</h2>
      <p>
        Nome, RE, posto/graduação, unidade e situação da contribuição. Guardamos também os comprovantes que você
        enviar. Não pedimos CPF.
      </p>

      <h2>Quem vê o quê</h2>
      <ul>
        <li>Todos os associados veem o saldo, cada entrada e cada saída, com o comprovante, o autor e a data.</li>
        <li>A lista de quem está em atraso é visível apenas ao tesoureiro.</li>
        <li>Nenhum lançamento pode ser editado ou apagado. Correções aparecem como estorno, com o motivo.</li>
      </ul>

      <h2>Para que usamos</h2>
      <p>
        Só para controlar as contribuições e os gastos do grêmio e prestar contas aos associados. Os dados ficam
        em servidor fora da rede da corporação e não são compartilhados com terceiros.
      </p>
    </div>

    <div v-if="erro" class="alerta alerta-erro" role="alert">{{ erro }}</div>
    <label class="ciente">
      <input v-model="ciente" type="checkbox" />
      Li e concordo com o termo de uso.
    </label>
    <button class="botao botao-largo" :disabled="!ciente || enviando" @click="aceitar">Concordar e continuar</button>
    <p class="suave centro"><a href="#" @click.prevent="sair">Não concordo, sair</a></p>
  </div>
</template>

<style scoped>
.termo h2:first-child {
  margin-top: 0;
}

.termo p,
.termo ul {
  margin: 0 0 0.5rem;
}

.ciente {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 1rem 0;
  font-weight: 600;
}

.ciente input {
  width: 22px;
  min-height: 22px;
}

.centro {
  text-align: center;
}
</style>
