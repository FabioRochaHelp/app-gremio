<script setup lang="ts">
import type { MensalidadeTesourariaDto } from '@gremio/shared';

const api = useApi();
const { data: revisao } = await useAsyncData('revisao', () =>
  api<MensalidadeTesourariaDto[]>('/api/mensalidades/revisao'),
);
</script>

<template>
  <div>
    <h1>Tesouraria</h1>
    <nav class="atalhos">
      <NuxtLink to="/tesouraria/lancar" class="botao botao-largo lancar">Lançar despesa ou entrada</NuxtLink>
      <NuxtLink to="/tesouraria/revisao" class="cartao atalho">
        <strong>Comprovantes para revisar</strong>
        <span :class="['contador', { pendente: revisao?.length }]">{{ revisao?.length ?? 0 }}</span>
      </NuxtLink>
      <NuxtLink to="/tesouraria/fechamento" class="cartao atalho">
        <strong>Fechar o mês</strong>
        <span class="suave">Conferir com o extrato do banco</span>
      </NuxtLink>
      <NuxtLink to="/tesouraria/mensalidades" class="cartao atalho">
        <strong>Mensalidades do mês</strong>
        <span class="suave">Gerar e acompanhar pagamentos</span>
      </NuxtLink>
      <NuxtLink to="/tesouraria/associados" class="cartao atalho">
        <strong>Associados</strong>
        <span class="suave">Cadastro e códigos de acesso</span>
      </NuxtLink>
      <NuxtLink to="/tesouraria/config" class="cartao atalho">
        <strong>Configuração</strong>
        <span class="suave">Valor, chave Pix e categorias</span>
      </NuxtLink>
    </nav>
  </div>
</template>

<style scoped>
.lancar {
  margin-bottom: 1rem;
}

.atalho {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  color: inherit;
  text-decoration: none;
}

.atalho:hover {
  border-color: var(--cor-marca);
}

.contador {
  min-width: 2rem;
  text-align: center;
  font-weight: 700;
  border-radius: 999px;
  padding: 0.1rem 0.6rem;
  background: #efe9e1;
}

.contador.pendente {
  background: var(--cor-marca);
  color: #fff;
}
</style>
