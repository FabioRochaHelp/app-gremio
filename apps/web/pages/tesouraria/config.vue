<script setup lang="ts">
import { configSchema, parseReais, type CategoriaDto, type ConfigDto } from '@gremio/shared';

const api = useApi();
const { data: config } = await useAsyncData('config', () => api<ConfigDto>('/api/config'));
const { data: categorias, refresh: recarregarCategorias } = await useAsyncData('categorias', () =>
  api<CategoriaDto[]>('/api/categorias'),
);

const form = reactive({ valor: '', chavePix: '', cnpj: '', nomeRecebedor: '', cidade: '' });
watchEffect(() => {
  if (!config.value) return;
  Object.assign(form, {
    valor: (config.value.valorMensalidade / 100).toFixed(2).replace('.', ','),
    chavePix: config.value.chavePix,
    cnpj: config.value.cnpj ?? '',
    nomeRecebedor: config.value.nomeRecebedor,
    cidade: config.value.cidade,
  });
});

const erros = ref<Record<string, string>>({});
const mensagem = ref<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

async function salvar() {
  erros.value = {};
  mensagem.value = null;
  const valor = parseReais(form.valor);
  const dados = configSchema.safeParse({
    valorMensalidade: valor ?? -1,
    chavePix: form.chavePix,
    cnpj: form.cnpj.trim() ? form.cnpj : null,
    nomeRecebedor: form.nomeRecebedor,
    cidade: form.cidade,
  });
  if (!dados.success) {
    for (const issue of dados.error.issues) erros.value[String(issue.path[0])] = issue.message;
    if (erros.value.valorMensalidade) erros.value.valorMensalidade = 'Informe um valor como 20,00';
    return;
  }
  try {
    config.value = await api<ConfigDto>('/api/config', { method: 'PUT', body: dados.data });
    mensagem.value = { tipo: 'ok', texto: 'Configuração salva.' };
  } catch (e) {
    mensagem.value = { tipo: 'erro', texto: lerErro(e).mensagem };
  }
}

const novaCategoria = ref('');
const erroCategoria = ref('');

async function criarCategoria() {
  erroCategoria.value = '';
  try {
    await api('/api/categorias', { method: 'POST', body: { nome: novaCategoria.value } });
    novaCategoria.value = '';
    await recarregarCategorias();
  } catch (e) {
    erroCategoria.value = lerErro(e).mensagem;
  }
}

async function alternarCategoria(categoria: CategoriaDto) {
  await api(`/api/categorias/${categoria.id}`, { method: 'PATCH', body: { ativa: !categoria.ativa } });
  await recarregarCategorias();
}
</script>

<template>
  <div>
    <h1>Configuração</h1>

    <h2>Cobrança</h2>
    <form class="cartao" @submit.prevent="salvar">
      <div v-if="mensagem" :class="['alerta', mensagem.tipo === 'ok' ? 'alerta-ok' : 'alerta-erro']" role="status">
        {{ mensagem.texto }}
      </div>
      <div class="campo">
        <label for="valor">Valor da mensalidade (R$)</label>
        <input id="valor" v-model="form.valor" inputmode="decimal" required />
        <span v-if="erros.valorMensalidade" class="erro-campo">{{ erros.valorMensalidade }}</span>
      </div>
      <div class="campo">
        <label for="chave">Chave Pix do grêmio</label>
        <input id="chave" v-model="form.chavePix" required />
        <span v-if="erros.chavePix" class="erro-campo">{{ erros.chavePix }}</span>
      </div>
      <div class="campo">
        <label for="cnpj">CNPJ do grêmio (opcional)</label>
        <input id="cnpj" v-model="form.cnpj" inputmode="numeric" />
        <span v-if="erros.cnpj" class="erro-campo">{{ erros.cnpj }}</span>
      </div>
      <div class="campo">
        <label for="recebedor">Nome do recebedor no Pix</label>
        <input id="recebedor" v-model="form.nomeRecebedor" maxlength="25" required />
        <span v-if="erros.nomeRecebedor" class="erro-campo">{{ erros.nomeRecebedor }}</span>
      </div>
      <div class="campo">
        <label for="cidade">Cidade da conta</label>
        <input id="cidade" v-model="form.cidade" maxlength="15" required />
        <span v-if="erros.cidade" class="erro-campo">{{ erros.cidade }}</span>
      </div>
      <p class="suave">A conta deve estar em nome do grêmio, nunca da unidade.</p>
      <button class="botao">Salvar</button>
    </form>

    <h2>Categorias de despesa</h2>
    <div class="cartao">
      <ul class="categorias">
        <li v-for="c in categorias" :key="c.id">
          <span :class="{ inativa: !c.ativa }">{{ c.nome }}</span>
          <button class="botao botao-secundario" @click="alternarCategoria(c)">
            {{ c.ativa ? 'Desativar' : 'Reativar' }}
          </button>
        </li>
      </ul>
      <form class="nova" @submit.prevent="criarCategoria">
        <input v-model="novaCategoria" placeholder="Nova categoria" aria-label="Nova categoria" required />
        <button class="botao">Adicionar</button>
      </form>
      <span v-if="erroCategoria" class="erro-campo">{{ erroCategoria }}</span>
    </div>
  </div>
</template>

<style scoped>
.categorias {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
}

.categorias li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--cor-borda);
}

.inativa {
  color: var(--cor-texto-suave);
  text-decoration: line-through;
}

.nova {
  display: flex;
  gap: 0.5rem;
}
</style>
