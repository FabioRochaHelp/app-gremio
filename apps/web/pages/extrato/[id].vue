<script setup lang="ts">
import { estornoSchema, formatarCentavos, rotuloCompetencia, type LancamentoDto } from '@gremio/shared';
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const api = useApi();
const id = useRoute().params.id as string;
const { data: lancamento, refresh } = await useAsyncData(`lancamento-${id}`, () =>
  api<LancamentoDto>(`/api/lancamentos/${id}`),
);

const TIPOS = { ENTRADA: 'Entrada', SAIDA: 'Despesa', ESTORNO: 'Estorno' } as const;

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

const erro = ref('');
async function verComprovante() {
  erro.value = '';
  try {
    await abrirArquivo(async () => (await api<{ url: string }>(`/api/lancamentos/${id}/comprovante`)).url);
  } catch (e) {
    erro.value = lerErro(e).mensagem;
  }
}

const podeEstornar = computed(
  () => auth.tesoureiro && lancamento.value && lancamento.value.tipo !== 'ESTORNO' && !lancamento.value.estornadoPor,
);
const estornando = ref(false);
const motivo = ref('');
const enviando = ref(false);

async function estornar() {
  erro.value = '';
  const dados = estornoSchema.safeParse({ motivo: motivo.value });
  if (!dados.success) {
    erro.value = dados.error.issues[0].message;
    return;
  }
  enviando.value = true;
  try {
    const estorno = await api<LancamentoDto>(`/api/lancamentos/${id}/estorno`, { method: 'POST', body: dados.data });
    await navigateTo(`/extrato/${estorno.id}`);
  } catch (e) {
    erro.value = lerErro(e).mensagem;
    await refresh();
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div v-if="lancamento">
    <p><NuxtLink :to="`/extrato?mes=${lancamento.competencia}`">← Extrato</NuxtLink></p>
    <h1>{{ lancamento.descricao }}</h1>

    <div class="cartao">
      <p class="valor">
        {{ lancamento.efeito >= 0 ? '+' : '−' }} {{ formatarCentavos(Math.abs(lancamento.efeito)) }}
      </p>
      <dl class="dados">
        <dt>Tipo</dt>
        <dd>{{ lancamento.deMensalidade && lancamento.tipo === 'ENTRADA' ? 'Mensalidade' : TIPOS[lancamento.tipo] }}</dd>
        <template v-if="lancamento.categoria">
          <dt>Categoria</dt>
          <dd>{{ lancamento.categoria.nome }}</dd>
        </template>
        <dt>Data</dt>
        <dd>{{ dataHora(lancamento.data) }}</dd>
        <dt>Mês</dt>
        <dd class="capitalizar">{{ rotuloCompetencia(lancamento.competencia) }}</dd>
        <dt>Lançado por</dt>
        <dd>{{ lancamento.autor ? `${lancamento.autor.posto} ${lancamento.autor.nome}` : 'Restrito ao tesoureiro' }}</dd>
        <dt>Registrado em</dt>
        <dd>{{ dataHora(lancamento.criadoEm) }}</dd>
        <template v-if="lancamento.motivoEstorno">
          <dt>Motivo do estorno</dt>
          <dd>{{ lancamento.motivoEstorno }}</dd>
        </template>
      </dl>

      <div v-if="lancamento.estornoDe" class="alerta alerta-aviso">
        Este lançamento desfaz
        <NuxtLink :to="`/extrato/${lancamento.estornoDe.id}`">{{ lancamento.estornoDe.descricao }}</NuxtLink>.
      </div>
      <div v-if="lancamento.estornadoPor" class="alerta alerta-aviso">
        Estornado em {{ dataHora(lancamento.estornadoPor.data) }}: {{ lancamento.estornadoPor.motivo }}.
        <NuxtLink :to="`/extrato/${lancamento.estornadoPor.id}`">Ver estorno</NuxtLink>
      </div>

      <div v-if="erro" class="alerta alerta-erro" role="alert">{{ erro }}</div>

      <button v-if="lancamento.comprovanteVisivel" class="botao botao-largo" @click="verComprovante">
        Ver comprovante
      </button>
      <p v-else-if="lancamento.deMensalidade && lancamento.tipo === 'ENTRADA'" class="suave">
        O comprovante de mensalidade mostra quem pagou e fica restrito ao tesoureiro.
      </p>
    </div>

    <template v-if="podeEstornar">
      <button v-if="!estornando" class="botao botao-secundario botao-largo" @click="estornando = true">
        Estornar lançamento
      </button>
      <form v-else class="cartao" @submit.prevent="estornar">
        <p>
          O estorno cria um novo lançamento que desfaz este, visível a todos com o motivo. Nada é apagado.
          <template v-if="lancamento.deMensalidade">A mensalidade volta a ficar em aberto.</template>
        </p>
        <div class="campo">
          <label for="motivo">Motivo</label>
          <textarea id="motivo" v-model="motivo" rows="2" required minlength="5" />
        </div>
        <div class="acoes">
          <button class="botao" :disabled="enviando">Confirmar estorno</button>
          <button type="button" class="botao botao-secundario" @click="estornando = false">Cancelar</button>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
h1 {
  overflow-wrap: anywhere;
}

.valor {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.capitalizar {
  text-transform: capitalize;
}
</style>
