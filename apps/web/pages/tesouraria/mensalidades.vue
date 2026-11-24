<script setup lang="ts">
import {
  baixaManualSchema,
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

// Recebimento manual: o associado mandou o comprovante ao tesoureiro por fora do app.
const hoje = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const recebendo = ref<string | null>(null);
const formBaixa = reactive({ data: '', e2eId: '' });
const arquivo = ref<File | null>(null);
const errosBaixa = ref<Record<string, string>>({});
const erroBaixa = ref('');
const enviando = ref(false);

function abrirBaixa(m: MensalidadeTesourariaDto) {
  Object.assign(formBaixa, { data: '', e2eId: m.dadosExtraidos?.e2eId ?? '' });
  arquivo.value = null;
  errosBaixa.value = {};
  erroBaixa.value = '';
  recebendo.value = m.id;
}

async function escolherArquivo(evento: Event) {
  const escolhido = (evento.target as HTMLInputElement).files?.[0];
  arquivo.value = escolhido ? await comprimirImagem(escolhido) : null;
}

async function registrarBaixa(m: MensalidadeTesourariaDto) {
  erroBaixa.value = '';
  errosBaixa.value = {};
  const dados = baixaManualSchema.safeParse(formBaixa);
  if (!dados.success) {
    for (const issue of dados.error.issues) errosBaixa.value[String(issue.path[0])] = issue.message;
    return;
  }
  if (!arquivo.value) {
    errosBaixa.value.arquivo = 'Anexe o comprovante que o associado mandou';
    return;
  }
  const corpo = new FormData();
  for (const [campo, v] of Object.entries(dados.data)) if (v !== undefined) corpo.append(campo, String(v));
  corpo.append('comprovante', arquivo.value);

  enviando.value = true;
  try {
    await api(`/api/mensalidades/${m.id}/baixa-manual`, { method: 'POST', body: corpo });
    recebendo.value = null;
    mensagem.value = { tipo: 'ok', texto: `Pagamento de ${m.associado.nome} registrado.` };
    await refresh();
  } catch (e) {
    const { mensagem: texto, campos } = lerErro(e);
    erroBaixa.value = texto;
    errosBaixa.value = campos;
  } finally {
    enviando.value = false;
  }
}

const podeReceber = (m: MensalidadeTesourariaDto) => m.status === 'ABERTA' || m.status === 'EM_REVISAO';
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
      <li v-for="m in mensalidades" :key="m.id" class="cartao">
        <div class="linha-entre">
          <div>
            <strong>{{ m.associado.posto }} {{ m.associado.nome }}</strong>
            <div class="suave">RE {{ m.associado.re }}</div>
          </div>
          <span :class="['etiqueta', `etiqueta-${m.status}`]">{{ ROTULO_STATUS_MENSALIDADE[m.status] }}</span>
        </div>

        <form v-if="recebendo === m.id" class="baixa" @submit.prevent="registrarBaixa(m)">
          <div v-if="erroBaixa" class="alerta alerta-erro" role="alert">{{ erroBaixa }}</div>
          <div class="campo">
            <label :for="`comprovante-${m.id}`">Comprovante que o associado mandou</label>
            <input
              :id="`comprovante-${m.id}`"
              type="file"
              accept="image/*,application/pdf"
              required
              @change="escolherArquivo"
            />
            <span v-if="errosBaixa.arquivo" class="erro-campo">{{ errosBaixa.arquivo }}</span>
            <span v-else class="suave">PDF do banco ou print/foto do comprovante.</span>
          </div>
          <div class="campo">
            <label :for="`data-${m.id}`">Data do pagamento</label>
            <input :id="`data-${m.id}`" v-model="formBaixa.data" type="date" :max="hoje()" />
            <span v-if="errosBaixa.data" class="erro-campo">{{ errosBaixa.data }}</span>
            <span v-else class="suave">Em branco: usa a data lida do PDF ou a de hoje.</span>
          </div>
          <div class="campo">
            <label :for="`e2e-${m.id}`">ID da transação (opcional)</label>
            <input :id="`e2e-${m.id}`" v-model="formBaixa.e2eId" autocomplete="off" placeholder="E…" />
            <span v-if="errosBaixa.e2eId" class="erro-campo">{{ errosBaixa.e2eId }}</span>
            <span v-else class="suave">Lido sozinho do PDF; evita usar o mesmo comprovante duas vezes.</span>
          </div>
          <div class="acoes">
            <button class="botao" :disabled="enviando">
              {{ enviando ? 'Registrando…' : `Dar baixa de ${formatarCentavos(m.valor)}` }}
            </button>
            <button type="button" class="botao botao-secundario" @click="recebendo = null">Cancelar</button>
          </div>
        </form>
        <button v-else-if="podeReceber(m)" class="botao botao-secundario" @click="abrirBaixa(m)">
          Registrar pagamento
        </button>
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

.baixa {
  margin-top: 0.75rem;
}

.acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.cartao > .botao {
  margin-top: 0.5rem;
}

.numero {
  font-size: 1.4rem;
  font-weight: 700;
}
</style>
