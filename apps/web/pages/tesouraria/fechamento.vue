<script setup lang="ts">
import { formatarCentavos, parseReais, rotuloCompetencia, type PreviaFechamentoDto } from '@gremio/shared';

const api = useApi();

// Por padrão, o mês anterior (o atual ainda não terminou).
const mesAnterior = () => {
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 15));
  return d.toISOString().slice(0, 7);
};
const competencia = ref(mesAnterior());
const { data: previa } = await useAsyncData(
  'previa-fechamento',
  () => api<PreviaFechamentoDto>('/api/fechamentos/previa', { query: { competencia: competencia.value } }),
  { watch: [competencia] },
);

const saldoBanco = ref('');
const extrato = ref<File | null>(null);
const ciente = ref(false);
const erro = ref('');
const enviando = ref(false);

const diferenca = computed(() => {
  const banco = parseReais(saldoBanco.value);
  return banco === null || !previa.value ? null : banco - previa.value.saldoSistema;
});

async function fechar() {
  erro.value = '';
  const banco = parseReais(saldoBanco.value);
  if (banco === null) {
    erro.value = 'Informe o saldo do banco no último dia do mês, como 1.234,56';
    return;
  }
  if (!extrato.value) {
    erro.value = 'Anexe o extrato do banco em PDF';
    return;
  }
  const corpo = new FormData();
  corpo.append('competencia', competencia.value);
  corpo.append('saldoBanco', String(banco));
  corpo.append('extrato', extrato.value);
  enviando.value = true;
  try {
    await api('/api/fechamentos', { method: 'POST', body: corpo });
    await navigateTo('/fechamentos');
  } catch (e) {
    erro.value = lerErro(e).mensagem;
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div>
    <h1>Fechar o mês</h1>

    <div class="campo">
      <label for="competencia">Mês</label>
      <input id="competencia" v-model="competencia" type="month" :max="mesAnterior()" required />
    </div>

    <template v-if="previa">
      <div v-if="previa.jaFechado" class="alerta alerta-aviso">
        {{ rotuloCompetencia(previa.competencia) }} já foi fechado. Veja em
        <NuxtLink to="/fechamentos">Prestações de contas</NuxtLink>.
      </div>

      <template v-else>
        <dl class="cartao dados">
          <dt>Saldo inicial</dt>
          <dd>{{ formatarCentavos(previa.saldoInicial) }}</dd>
          <dt>Entradas</dt>
          <dd>{{ formatarCentavos(previa.entradas) }}</dd>
          <dt>Saídas</dt>
          <dd>{{ formatarCentavos(previa.saidas) }}</dd>
          <dt><strong>Saldo no sistema</strong></dt>
          <dd><strong>{{ formatarCentavos(previa.saldoSistema) }}</strong></dd>
        </dl>

        <div v-if="previa.mensalidadesPendentes" class="alerta alerta-aviso">
          Há {{ previa.mensalidadesPendentes }} comprovante(s) em leitura ou revisão. Resolva antes de fechar, se forem
          deste mês: depois do fechamento, a baixa entra no mês corrente.
        </div>

        <form class="cartao" @submit.prevent="fechar">
          <div v-if="erro" class="alerta alerta-erro" role="alert">{{ erro }}</div>
          <div class="campo">
            <label for="saldo">Saldo do banco no último dia do mês (R$)</label>
            <input id="saldo" v-model="saldoBanco" inputmode="decimal" placeholder="0,00" required />
            <span v-if="diferenca !== null && diferenca !== 0" class="erro-campo">
              Difere do sistema em {{ formatarCentavos(Math.abs(diferenca)) }}; a diferença sai na prestação de contas.
            </span>
          </div>
          <div class="campo">
            <label for="extrato">Extrato do banco do mês (PDF)</label>
            <input
              id="extrato"
              type="file"
              accept="application/pdf"
              @change="extrato = ($event.target as HTMLInputElement).files?.[0] ?? null"
            />
            <span class="suave">Fica só com o tesoureiro: o extrato mostra quem fez cada Pix.</span>
          </div>
          <label class="ciente">
            <input v-model="ciente" type="checkbox" />
            Entendo que o fechamento não pode ser desfeito e trava lançamentos neste mês e nos anteriores.
          </label>
          <button class="botao botao-largo" :disabled="!ciente || enviando">
            {{ enviando ? 'Fechando…' : `Fechar ${rotuloCompetencia(competencia)}` }}
          </button>
        </form>
      </template>
    </template>
  </div>
</template>

<style scoped>
.ciente {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  margin: 0.5rem 0 1rem;
  font-size: 0.9rem;
}

.ciente input {
  width: 20px;
  min-height: 20px;
  flex: none;
  margin-top: 0.15rem;
}
</style>
