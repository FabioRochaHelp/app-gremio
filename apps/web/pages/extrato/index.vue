<script setup lang="ts">
import { competenciaDe, formatarCentavos, type LancamentoDto } from '@gremio/shared';

const api = useApi();
const rota = useRoute();
const competencia = ref((rota.query.mes as string) || competenciaDe(new Date()));
watch(competencia, (mes) => navigateTo({ query: { mes } }, { replace: true }));

const { data: lancamentos } = await useAsyncData(
  'extrato',
  () => api<LancamentoDto[]>('/api/lancamentos', { query: { competencia: competencia.value } }),
  { watch: [competencia] },
);

const totais = computed(() => {
  let entradas = 0;
  let saidas = 0;
  for (const l of lancamentos.value ?? []) {
    if (l.efeito >= 0) entradas += l.efeito;
    else saidas -= l.efeito;
  }
  return { entradas, saidas, resultado: entradas - saidas };
});
</script>

<template>
  <div>
    <h1>Extrato</h1>
    <div class="campo">
      <label for="mes">Mês</label>
      <input id="mes" v-model="competencia" type="month" required />
    </div>

    <dl class="cartao totais">
      <div><dt class="suave">Entradas</dt><dd>{{ formatarCentavos(totais.entradas) }}</dd></div>
      <div><dt class="suave">Saídas</dt><dd>{{ formatarCentavos(totais.saidas) }}</dd></div>
      <div><dt class="suave">Resultado</dt><dd>{{ formatarCentavos(totais.resultado) }}</dd></div>
    </dl>

    <section class="cartao">
      <p v-if="!lancamentos?.length" class="suave">Nenhum lançamento neste mês.</p>
      <ItemLancamento v-for="l in lancamentos" :key="l.id" :lancamento="l" />
    </section>
    <p class="suave">
      Nada é apagado ou editado: correções aparecem como estorno, com o motivo. Veja também as
      <NuxtLink to="/fechamentos">prestações de contas mensais</NuxtLink>.
    </p>
  </div>
</template>

<style scoped>
.totais {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin: 0 0 1rem;
}

.totais dt {
  font-size: 0.8rem;
}

.totais dd {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
