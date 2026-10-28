<script setup lang="ts">
import {
  formatarCentavos,
  rotuloCompetencia,
  ROTULO_STATUS_MENSALIDADE,
  type MensalidadeDto,
} from '@gremio/shared';

const api = useApi();
const { data: mensalidades, refresh } = await useAsyncData('minhas-mensalidades', () =>
  api<MensalidadeDto[]>('/api/mensalidades/minhas'),
);

const abertaParaPagar = ref<string | null>(null);
const erro = ref('');

function atualizar(m: MensalidadeDto) {
  const lista = mensalidades.value ?? [];
  const i = lista.findIndex((x) => x.id === m.id);
  if (i >= 0) lista.splice(i, 1, m);
  abertaParaPagar.value = null;
}

// Enquanto houver comprovante sendo lido, consulta de novo a cada poucos segundos.
let consultas = 0;
const timer = setInterval(async () => {
  if (!mensalidades.value?.some((m) => m.status === 'EM_ANALISE')) {
    consultas = 0;
    return;
  }
  if (++consultas > 40) return;
  await refresh();
}, 3000);
onBeforeUnmount(() => clearInterval(timer));

async function verComprovante(m: MensalidadeDto) {
  erro.value = '';
  try {
    await abrirArquivo(async () => (await api<{ url: string }>(`/api/mensalidades/${m.id}/comprovante`)).url);
  } catch (e) {
    erro.value = lerErro(e).mensagem;
  }
}
</script>

<template>
  <div>
    <h1>Minhas mensalidades</h1>
    <p class="suave">A adesão ao grêmio é voluntária.</p>
    <div v-if="erro" class="alerta alerta-erro" role="alert">{{ erro }}</div>

    <p v-if="!mensalidades?.length" class="cartao suave">Nenhuma mensalidade gerada ainda.</p>

    <ul class="lista-simples">
      <li v-for="m in mensalidades" :key="m.id" class="cartao">
        <div class="linha-entre">
          <div>
            <strong class="capitalizar">{{ rotuloCompetencia(m.competencia) }}</strong>
            <div class="suave">{{ formatarCentavos(m.valor) }}</div>
          </div>
          <span :class="['etiqueta', `etiqueta-${m.status}`]">{{ ROTULO_STATUS_MENSALIDADE[m.status] }}</span>
        </div>

        <div v-if="m.status === 'ABERTA' && m.motivoRecusa" class="alerta alerta-aviso">
          Comprovante anterior recusado: {{ m.motivoRecusa }}
        </div>
        <p v-if="m.status === 'EM_ANALISE'" class="suave">Conferindo o comprovante, aguarde alguns segundos…</p>
        <p v-if="m.status === 'EM_REVISAO'" class="suave">
          A leitura automática não confirmou o pagamento ({{ m.motivoRecusa }}). O tesoureiro vai conferir.
        </p>
        <p v-if="m.status === 'PAGA'" class="suave">
          Baixa {{ m.tipoBaixa === 'AUTOMATICA' ? 'automática' : 'feita pelo tesoureiro' }}.
        </p>

        <div class="acoes">
          <button
            v-if="m.status === 'ABERTA' && abertaParaPagar !== m.id"
            class="botao"
            @click="abertaParaPagar = m.id"
          >
            Pagar
          </button>
          <button v-if="m.temComprovante && m.status !== 'ABERTA'" class="botao botao-secundario" @click="verComprovante(m)">
            Ver comprovante
          </button>
        </div>

        <PagarMensalidade v-if="abertaParaPagar === m.id" :mensalidade="m" @enviado="atualizar" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.capitalizar {
  text-transform: capitalize;
}

.acoes:empty {
  display: none;
}
</style>
