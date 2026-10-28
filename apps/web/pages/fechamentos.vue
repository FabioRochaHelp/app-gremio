<script setup lang="ts">
import { formatarCentavos, rotuloCompetencia, textoDivergencia, type FechamentoDto } from '@gremio/shared';
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const api = useApi();
const { data: fechamentos, refresh } = await useAsyncData('fechamentos', () => api<FechamentoDto[]>('/api/fechamentos'));

// O PDF é gerado em segundo plano logo após o fechamento.
const timer = setInterval(() => {
  if (fechamentos.value?.some((f) => !f.pdfPronto)) refresh();
}, 4000);
onBeforeUnmount(() => clearInterval(timer));

const erro = ref('');
async function abrir(competencia: string, arquivo: 'pdf' | 'extrato') {
  erro.value = '';
  try {
    await abrirArquivo(async () => (await api<{ url: string }>(`/api/fechamentos/${competencia}/${arquivo}`)).url);
  } catch (e) {
    erro.value = lerErro(e).mensagem;
  }
}

const dataSp = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
</script>

<template>
  <div>
    <h1>Prestações de contas</h1>
    <p class="suave">
      Todo mês o tesoureiro confere o saldo com o extrato do banco. Qualquer diferença aparece aqui e no PDF.
    </p>
    <NuxtLink v-if="auth.tesoureiro" to="/tesouraria/fechamento" class="botao botao-largo">Fechar um mês</NuxtLink>
    <div v-if="erro" class="alerta alerta-erro" role="alert">{{ erro }}</div>

    <p v-if="!fechamentos?.length" class="cartao suave">Nenhum mês fechado ainda.</p>

    <ul class="lista-simples lista">
      <li v-for="f in fechamentos" :key="f.competencia" class="cartao">
        <div class="linha-entre">
          <strong class="capitalizar">{{ rotuloCompetencia(f.competencia) }}</strong>
          <span :class="['etiqueta', f.divergencias.length ? 'etiqueta-INADIMPLENTE' : 'etiqueta-PAGA']">
            {{ f.divergencias.length ? `${f.divergencias.length} divergência(s)` : 'confere com o banco' }}
          </span>
        </div>
        <dl class="dados">
          <dt>Saldo no sistema</dt>
          <dd>{{ formatarCentavos(f.saldoSistema) }}</dd>
          <dt>Saldo no banco</dt>
          <dd>{{ formatarCentavos(f.saldoBanco) }}</dd>
          <dt>Fechado por</dt>
          <dd>{{ f.fechadoPor.posto }} {{ f.fechadoPor.nome }} em {{ dataSp(f.fechadoEm) }}</dd>
        </dl>
        <ul v-if="f.divergencias.length" class="alerta alerta-erro divergencias">
          <li v-for="(d, i) in f.divergencias" :key="i">{{ textoDivergencia(d) }}</li>
        </ul>
        <div class="acoes">
          <button v-if="f.pdfPronto" class="botao" @click="abrir(f.competencia, 'pdf')">Baixar prestação de contas</button>
          <span v-else class="suave">Gerando o PDF…</span>
          <button v-if="auth.tesoureiro" class="botao botao-secundario" @click="abrir(f.competencia, 'extrato')">
            Extrato do banco
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.lista {
  margin-top: 1rem;
}

.capitalizar {
  text-transform: capitalize;
}

.divergencias {
  padding-left: 1.75rem;
}

.divergencias li + li {
  margin-top: 0.35rem;
}
</style>
