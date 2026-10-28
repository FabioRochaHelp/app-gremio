<script setup lang="ts">
import { formatarCentavos, rotuloCompetencia, type TotaisMes } from '@gremio/shared';

const props = defineProps<{ meses: TotaisMes[]; atual: string }>();

// Toque numa coluna mostra os valores daquele mês; começa no mês atual.
const selecionado = ref(props.atual);
const mesSelecionado = computed(() => props.meses.find((m) => m.competencia === selecionado.value) ?? props.meses.at(-1)!);

const maximo = computed(() => Math.max(1, ...props.meses.flatMap((m) => [m.entradas, m.saidas])));
const altura = (valor: number) => `${(Math.max(0, valor) / maximo.value) * 100}%`;

const mesCurto = (competencia: string) =>
  new Date(`${competencia}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '');
</script>

<template>
  <figure class="grafico">
    <figcaption class="leitura" aria-live="polite">
      <strong class="capitalizar">{{ rotuloCompetencia(mesSelecionado.competencia) }}</strong>
      <span><i class="amostra entradas" />Entradas {{ formatarCentavos(mesSelecionado.entradas) }}</span>
      <span><i class="amostra saidas" />Saídas {{ formatarCentavos(mesSelecionado.saidas) }}</span>
    </figcaption>

    <div class="area" role="group" aria-label="Entradas e saídas por mês">
      <button
        v-for="m in meses"
        :key="m.competencia"
        type="button"
        :class="['mes', { ativo: m.competencia === mesSelecionado.competencia }]"
        :aria-label="`${rotuloCompetencia(m.competencia)}: entradas ${formatarCentavos(m.entradas)}, saídas ${formatarCentavos(m.saidas)}`"
        @click="selecionado = m.competencia"
      >
        <span class="colunas">
          <span class="coluna entradas" :style="{ height: altura(m.entradas) }" />
          <span class="coluna saidas" :style="{ height: altura(m.saidas) }" />
        </span>
      </button>
    </div>
    <div class="rotulos" aria-hidden="true">
      <span v-for="m in meses" :key="m.competencia">{{ mesCurto(m.competencia) }}</span>
    </div>

    <div class="legenda" aria-hidden="true">
      <span><i class="amostra entradas" />Entradas</span>
      <span><i class="amostra saidas" />Saídas</span>
    </div>

    <details class="tabela">
      <summary>Ver em tabela</summary>
      <table>
        <thead>
          <tr><th>Mês</th><th>Entradas</th><th>Saídas</th></tr>
        </thead>
        <tbody>
          <tr v-for="m in meses" :key="m.competencia">
            <td class="capitalizar">{{ rotuloCompetencia(m.competencia) }}</td>
            <td>{{ formatarCentavos(m.entradas) }}</td>
            <td>{{ formatarCentavos(m.saidas) }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </figure>
</template>

<style scoped>
.grafico {
  margin: 0;
}

.leitura {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  align-items: baseline;
  margin-bottom: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.capitalizar {
  text-transform: capitalize;
}

.area {
  display: flex;
  height: 140px;
  border-bottom: 1px solid var(--cor-texto-suave);
}

.mes {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  font: inherit;
  border-radius: 6px 6px 0 0;
}

.mes.ativo {
  background: var(--grade);
}

.colunas {
  flex: 1;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 2px;
}

.coluna {
  width: min(24px, 35%);
  border-radius: 4px 4px 0 0;
  min-height: 0;
}

.coluna.entradas,
.amostra.entradas {
  background: var(--serie-entradas);
}

.coluna.saidas,
.amostra.saidas {
  background: var(--serie-saidas);
}

.rotulos {
  display: flex;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--cor-texto-suave);
}

.rotulos span {
  flex: 1;
  text-align: center;
}

.legenda {
  display: flex;
  gap: 1rem;
  margin-top: 0.75rem;
  font-size: 0.8rem;
  color: var(--cor-texto-suave);
}

.amostra {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 0.35rem;
}

.tabela {
  margin-top: 0.75rem;
  font-size: 0.85rem;
}

.tabela summary {
  cursor: pointer;
  color: var(--cor-marca);
}

.tabela table {
  width: 100%;
  margin-top: 0.5rem;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.tabela th,
.tabela td {
  text-align: right;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--cor-borda);
}

.tabela th:first-child,
.tabela td:first-child {
  text-align: left;
}
</style>
