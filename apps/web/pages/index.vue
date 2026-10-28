<script setup lang="ts">
import { formatarCentavos, rotuloCompetencia, type PainelDto } from '@gremio/shared';
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const api = useApi();
const { data: painel } = await useAsyncData('painel', () => api<PainelDto>('/api/painel'));
</script>

<template>
  <div v-if="painel">
    <h1>Olá, {{ auth.usuario?.nome.split(' ')[0] }}</h1>

    <section class="cartao destaque" aria-label="Saldo do grêmio">
      <span class="suave">Saldo do grêmio</span>
      <span class="saldo">{{ formatarCentavos(painel.saldo) }}</span>
      <span class="suave mes">
        Em {{ rotuloCompetencia(painel.mesAtual.competencia) }}: entrou
        {{ formatarCentavos(painel.mesAtual.entradas) }}, saiu {{ formatarCentavos(painel.mesAtual.saidas) }}
      </span>
    </section>

    <NuxtLink to="/mensalidades" class="botao botao-largo">Pagar mensalidade</NuxtLink>

    <h2>Entradas e saídas</h2>
    <section class="cartao">
      <GraficoMeses :meses="painel.meses" :atual="painel.mesAtual.competencia" />
    </section>

    <h2>Despesas do mês por categoria</h2>
    <section class="cartao">
      <GraficoCategorias :categorias="painel.categorias" />
    </section>

    <h2>Últimos lançamentos</h2>
    <section class="cartao lista">
      <p v-if="!painel.ultimos.length" class="suave">Nenhum lançamento ainda.</p>
      <ItemLancamento v-for="l in painel.ultimos" :key="l.id" :lancamento="l" />
      <NuxtLink to="/extrato" class="ver-tudo">Ver extrato completo</NuxtLink>
    </section>

    <NuxtLink to="/fechamentos" class="cartao atalho">Prestações de contas mensais →</NuxtLink>
  </div>
</template>

<style scoped>
.destaque {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.saldo {
  font-size: 2.2rem;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.mes::first-letter {
  text-transform: uppercase;
}

.lista {
  padding-top: 0.25rem;
}

.atalho {
  display: block;
  color: var(--cor-marca);
  font-weight: 600;
  text-decoration: none;
}

.ver-tudo {
  display: block;
  padding-top: 0.75rem;
  text-align: center;
}
</style>
