<script setup lang="ts">
import {
  competenciaDe,
  formatarCentavos,
  rotuloCompetencia,
  ROTULO_STATUS_MENSALIDADE,
  StatusMensalidade,
  type MensalidadeTesourariaDto,
} from '@gremio/shared';

const api = useApi();
const competencia = ref(competenciaDe(new Date()));
const { data: mensalidades, refresh } = await useAsyncData(
  'mensalidades-mes',
  () => api<MensalidadeTesourariaDto[]>('/api/mensalidades', { query: { competencia: competencia.value } }),
  { watch: [competencia] },
);

const resumo = computed(() => {
  const contagem = Object.fromEntries(Object.values(StatusMensalidade).map((s) => [s, 0])) as Record<
    StatusMensalidade,
    number
  >;
  let arrecadado = 0;
  for (const m of mensalidades.value ?? []) {
    contagem[m.status]++;
    if (m.status === 'PAGA') arrecadado += m.valor;
  }
  return { contagem, arrecadado };
});

const gerando = ref(false);
const mensagem = ref<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

async function gerar() {
  gerando.value = true;
  mensagem.value = null;
  try {
    const { criadas } = await api<{ criadas: number }>('/api/mensalidades/gerar', {
      method: 'POST',
      body: { competencia: competencia.value },
    });
    mensagem.value = {
      tipo: 'ok',
      texto: criadas ? `${criadas} mensalidade(s) criada(s).` : 'Todos os associados já tinham mensalidade neste mês.',
    };
    await refresh();
  } catch (e) {
    mensagem.value = { tipo: 'erro', texto: lerErro(e).mensagem };
  } finally {
    gerando.value = false;
  }
}
</script>

<template>
  <div>
    <h1>Mensalidades</h1>

    <div class="cartao">
      <div class="campo">
        <label for="competencia">Mês</label>
        <input id="competencia" v-model="competencia" type="month" required />
      </div>
      <div v-if="mensagem" :class="['alerta', mensagem.tipo === 'ok' ? 'alerta-ok' : 'alerta-erro']" role="status">
        {{ mensagem.texto }}
      </div>
      <button class="botao botao-largo" :disabled="gerando || !competencia" @click="gerar">
        Gerar mensalidades de {{ competencia ? rotuloCompetencia(competencia) : '…' }}
      </button>
      <p class="suave">
        No dia 1 de cada mês isso acontece sozinho. Use o botão para associados cadastrados depois disso.
      </p>
    </div>

    <div class="resumo">
      <div v-for="(qtd, status) in resumo.contagem" :key="status" class="cartao item-resumo">
        <span class="numero">{{ qtd }}</span>
        <span class="suave">{{ ROTULO_STATUS_MENSALIDADE[status] }}</span>
      </div>
    </div>
    <p>Arrecadado no mês: <strong>{{ formatarCentavos(resumo.arrecadado) }}</strong></p>

    <ul class="lista-simples">
      <li v-for="m in mensalidades" :key="m.id" class="cartao linha-entre">
        <div>
          <strong>{{ m.associado.posto }} {{ m.associado.nome }}</strong>
          <div class="suave">RE {{ m.associado.re }}</div>
        </div>
        <span :class="['etiqueta', `etiqueta-${m.status}`]">{{ ROTULO_STATUS_MENSALIDADE[m.status] }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.resumo {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 0.5rem;
}

.item-resumo {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  padding: 0.6rem;
  text-align: center;
}

.numero {
  font-size: 1.4rem;
  font-weight: 700;
}
</style>
