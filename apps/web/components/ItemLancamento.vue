<script setup lang="ts">
import { formatarCentavos, type LancamentoDto } from '@gremio/shared';

const props = defineProps<{ lancamento: LancamentoDto }>();

const rotuloTipo = computed(() => {
  const l = props.lancamento;
  if (l.tipo === 'ESTORNO') return 'Estorno';
  if (l.tipo === 'SAIDA') return l.categoria?.nome ?? 'Despesa';
  return l.deMensalidade ? 'Mensalidade' : 'Entrada';
});

const valor = computed(() => {
  const { efeito } = props.lancamento;
  return `${efeito >= 0 ? '+' : '−'} ${formatarCentavos(Math.abs(efeito))}`;
});

const data = computed(() =>
  new Date(props.lancamento.data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }),
);
</script>

<template>
  <NuxtLink :to="`/extrato/${lancamento.id}`" class="item">
    <span :class="['marcador', `marcador-${lancamento.efeito >= 0 ? 'entrada' : 'saida'}`]" aria-hidden="true" />
    <span class="texto">
      <span class="descricao">{{ lancamento.descricao }}</span>
      <span class="suave meta">
        {{ data }} · {{ rotuloTipo }}
        <span v-if="lancamento.estornadoPor" class="etiqueta">estornado</span>
      </span>
    </span>
    <span :class="['valor', { riscado: lancamento.estornadoPor }]">{{ valor }}</span>
  </NuxtLink>
</template>

<style scoped>
.item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--cor-borda);
  color: inherit;
  text-decoration: none;
}

.marcador {
  flex: none;
  width: 4px;
  align-self: stretch;
  border-radius: 2px;
}

.marcador-entrada {
  background: var(--serie-entradas);
}

.marcador-saida {
  background: var(--serie-saidas);
}

.texto {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.descricao {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  font-size: 0.8rem;
}

.valor {
  flex: none;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.riscado {
  text-decoration: line-through;
  color: var(--cor-texto-suave);
}
</style>
