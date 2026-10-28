<script setup lang="ts">
import { formatarCentavos, rotuloCompetencia, type MensalidadeTesourariaDto } from '@gremio/shared';

const api = useApi();
const { data: pendentes, refresh } = await useAsyncData('revisao', () =>
  api<MensalidadeTesourariaDto[]>('/api/mensalidades/revisao'),
);

// Estado do formulário de cada cartão, indexado pelo id da mensalidade.
const e2e = reactive<Record<string, string>>({});
const motivo = reactive<Record<string, string>>({});
const recusando = ref<string | null>(null);
const ocupado = ref<string | null>(null);
const erro = reactive<Record<string, string>>({});

watchEffect(() => {
  for (const m of pendentes.value ?? []) e2e[m.id] ??= m.dadosExtraidos?.e2eId ?? '';
});

async function executar(m: MensalidadeTesourariaDto, acao: () => Promise<unknown>) {
  ocupado.value = m.id;
  erro[m.id] = '';
  try {
    await acao();
    recusando.value = null;
    await refresh();
  } catch (e) {
    erro[m.id] = lerErro(e).mensagem;
  } finally {
    ocupado.value = null;
  }
}

const aprovar = (m: MensalidadeTesourariaDto) =>
  executar(m, () => api(`/api/mensalidades/${m.id}/aprovar`, { method: 'POST', body: { e2eId: e2e[m.id] } }));

const recusar = (m: MensalidadeTesourariaDto) =>
  executar(m, () => api(`/api/mensalidades/${m.id}/recusar`, { method: 'POST', body: { motivo: motivo[m.id] ?? '' } }));

async function verComprovante(m: MensalidadeTesourariaDto) {
  try {
    await abrirArquivo(async () => (await api<{ url: string }>(`/api/mensalidades/${m.id}/comprovante`)).url);
  } catch (e) {
    erro[m.id] = lerErro(e).mensagem;
  }
}

const formatarData = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
</script>

<template>
  <div>
    <h1>Comprovantes para revisar</h1>
    <p class="suave">
      A leitura automática não conseguiu confirmar estes pagamentos. Abra o comprovante, confira e aprove ou
      devolva ao associado. Na dúvida, confira no extrato do banco.
    </p>

    <p v-if="!pendentes?.length" class="cartao suave">Nada para revisar.</p>

    <ul class="lista-simples">
      <li v-for="m in pendentes" :key="m.id" class="cartao">
        <div class="linha-entre">
          <div>
            <strong>{{ m.associado.posto }} {{ m.associado.nome }}</strong>
            <div class="suave">RE {{ m.associado.re }} · {{ rotuloCompetencia(m.competencia) }}</div>
          </div>
          <strong>{{ formatarCentavos(m.valor) }}</strong>
        </div>

        <div class="alerta alerta-aviso">{{ m.motivoRecusa }}</div>

        <dl v-if="m.dadosExtraidos" class="dados">
          <dt>Banco</dt>
          <dd>{{ m.dadosExtraidos.banco ?? 'não identificado' }}</dd>
          <dt>Valor lido</dt>
          <dd>{{ m.dadosExtraidos.valor !== null ? formatarCentavos(m.dadosExtraidos.valor) : '—' }}</dd>
          <dt>Data lida</dt>
          <dd>{{ m.dadosExtraidos.data ? formatarData(m.dadosExtraidos.data) : '—' }}</dd>
          <dt>Recebedor</dt>
          <dd>{{ m.dadosExtraidos.recebedorConfere ? 'confere com o grêmio' : 'não encontrado no comprovante' }}</dd>
        </dl>

        <button class="botao botao-secundario botao-largo" @click="verComprovante(m)">Abrir comprovante</button>

        <div v-if="erro[m.id]" class="alerta alerta-erro" role="alert">{{ erro[m.id] }}</div>

        <template v-if="recusando !== m.id">
          <div class="campo e2e">
            <label :for="`e2e-${m.id}`">ID da transação (E2E), se houver</label>
            <input :id="`e2e-${m.id}`" v-model="e2e[m.id]" autocapitalize="characters" spellcheck="false" />
          </div>
          <div class="acoes">
            <button class="botao" :disabled="ocupado === m.id" @click="aprovar(m)">Aprovar pagamento</button>
            <button class="botao botao-secundario" @click="recusando = m.id">Devolver ao associado</button>
          </div>
        </template>

        <form v-else class="recusa" @submit.prevent="recusar(m)">
          <div class="campo">
            <label :for="`motivo-${m.id}`">O que o associado precisa corrigir?</label>
            <textarea :id="`motivo-${m.id}`" v-model="motivo[m.id]" rows="2" required minlength="5" />
          </div>
          <div class="acoes">
            <button class="botao" :disabled="ocupado === m.id">Devolver</button>
            <button type="button" class="botao botao-secundario" @click="recusando = null">Cancelar</button>
          </div>
        </form>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.e2e {
  margin-top: 1rem;
}

.e2e input {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.85rem;
}

.recusa {
  margin-top: 1rem;
}
</style>
