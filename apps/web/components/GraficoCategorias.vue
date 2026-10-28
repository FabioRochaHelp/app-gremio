<script setup lang="ts">
import { formatarCentavos } from '@gremio/shared';

const props = defineProps<{ categorias: { nome: string; total: number }[] }>();
const maximo = computed(() => Math.max(1, ...props.categorias.map((c) => c.total)));
</script>

<template>
  <p v-if="!categorias.length" class="suave">Nenhuma despesa neste mês.</p>
  <ul v-else class="barras" aria-label="Despesas do mês por categoria">
    <li v-for="c in categorias" :key="c.nome">
      <span class="nome">{{ c.nome }}</span>
      <span class="trilho">
        <span class="barra" :style="{ width: `calc((100% - 6.5rem) * ${Math.max(0, c.total) / maximo})` }" />
        <span class="valor">{{ formatarCentavos(c.total) }}</span>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.barras {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
}

li {
  display: grid;
  grid-template-columns: minmax(4.5rem, 30%) 1fr;
  align-items: center;
  gap: 0.75rem;
}

.nome {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9rem;
}

.trilho {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.barra {
  flex: none;
  height: 14px;
  min-width: 2px;
  border-radius: 0 4px 4px 0;
  background: var(--serie-saidas);
}

.valor {
  flex: none;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
</style>
