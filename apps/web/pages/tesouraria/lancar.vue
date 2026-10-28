<script setup lang="ts">
import { lancamentoSchema, parseReais, type CategoriaDto, type LancamentoDto } from '@gremio/shared';

const api = useApi();
const { data: categorias } = await useAsyncData('categorias', () => api<CategoriaDto[]>('/api/categorias'));
const ativas = computed(() => (categorias.value ?? []).filter((c) => c.ativa));

const hoje = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const form = reactive({ tipo: 'SAIDA' as 'SAIDA' | 'ENTRADA', categoriaId: '', valor: '', descricao: '', data: hoje() });
const arquivo = ref<File | null>(null);
const previa = ref<string | null>(null);
const erros = ref<Record<string, string>>({});
const erro = ref('');
const enviando = ref(false);

async function escolherArquivo(evento: Event) {
  const escolhido = (evento.target as HTMLInputElement).files?.[0];
  if (previa.value) URL.revokeObjectURL(previa.value);
  previa.value = null;
  arquivo.value = null;
  if (!escolhido) return;
  arquivo.value = await comprimirImagem(escolhido);
  if (arquivo.value.type.startsWith('image/')) previa.value = URL.createObjectURL(arquivo.value);
}
onBeforeUnmount(() => previa.value && URL.revokeObjectURL(previa.value));

async function lancar() {
  erro.value = '';
  erros.value = {};
  const valor = parseReais(form.valor);
  const dados = lancamentoSchema.safeParse({ ...form, valor: valor ?? 0 });
  if (!dados.success) {
    for (const issue of dados.error.issues) erros.value[String(issue.path[0])] = issue.message;
    return;
  }
  if (!arquivo.value) {
    erros.value.arquivo = 'A foto da nota ou do recibo é obrigatória';
    return;
  }
  const corpo = new FormData();
  for (const [campo, v] of Object.entries(dados.data)) if (v !== undefined) corpo.append(campo, String(v));
  corpo.append('comprovante', arquivo.value);

  enviando.value = true;
  try {
    const criado = await api<LancamentoDto>('/api/lancamentos', { method: 'POST', body: corpo });
    await navigateTo(`/extrato/${criado.id}`);
  } catch (e) {
    const { mensagem, campos } = lerErro(e);
    erro.value = mensagem;
    erros.value = campos;
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div>
    <h1>Novo lançamento</h1>
    <form class="cartao" @submit.prevent="lancar">
      <div v-if="erro" class="alerta alerta-erro" role="alert">{{ erro }}</div>

      <fieldset class="tipo">
        <legend class="sr-only">Tipo</legend>
        <label :class="{ escolhido: form.tipo === 'SAIDA' }">
          <input v-model="form.tipo" type="radio" value="SAIDA" /> Despesa
        </label>
        <label :class="{ escolhido: form.tipo === 'ENTRADA' }">
          <input v-model="form.tipo" type="radio" value="ENTRADA" /> Entrada avulsa
        </label>
      </fieldset>

      <div v-if="form.tipo === 'SAIDA'" class="campo">
        <label for="categoria">Categoria</label>
        <select id="categoria" v-model="form.categoriaId" required>
          <option value="" disabled>Escolha…</option>
          <option v-for="c in ativas" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </select>
        <span v-if="erros.categoriaId" class="erro-campo">{{ erros.categoriaId }}</span>
      </div>

      <div class="campo">
        <label for="valor">Valor (R$)</label>
        <input id="valor" v-model="form.valor" inputmode="decimal" placeholder="0,00" required />
        <span v-if="erros.valor" class="erro-campo">{{ erros.valor }}</span>
      </div>

      <div class="campo">
        <label for="descricao">{{ form.tipo === 'SAIDA' ? 'Justificativa' : 'Origem da entrada' }}</label>
        <textarea id="descricao" v-model="form.descricao" rows="2" maxlength="300" required />
        <span v-if="erros.descricao" class="erro-campo">{{ erros.descricao }}</span>
      </div>

      <div class="campo">
        <label for="data">Data</label>
        <input id="data" v-model="form.data" type="date" :max="hoje()" required />
        <span v-if="erros.data" class="erro-campo">{{ erros.data }}</span>
      </div>

      <div class="campo">
        <label for="arquivo">Foto da nota ou recibo</label>
        <input id="arquivo" type="file" accept="image/*,application/pdf" @change="escolherArquivo" />
        <span v-if="erros.arquivo" class="erro-campo">{{ erros.arquivo }}</span>
        <img v-if="previa" :src="previa" alt="Prévia do comprovante" class="previa" />
        <span v-else-if="arquivo" class="suave">{{ arquivo.name }}</span>
      </div>

      <p class="suave">Todos os associados recebem um aviso com o valor e o comprovante assim que você lançar.</p>
      <button class="botao botao-largo" :disabled="enviando">{{ enviando ? 'Lançando…' : 'Lançar' }}</button>
    </form>
  </div>
</template>

<style scoped>
.tipo {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  border: 0;
  padding: 0;
  margin: 0 0 1rem;
}

.tipo label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 44px;
  border: 1px solid var(--cor-borda);
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}

.tipo label.escolhido {
  border-color: var(--cor-marca);
  background: #f5ebe6;
  color: var(--cor-marca);
}

.tipo input {
  width: auto;
  min-height: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.previa {
  margin-top: 0.5rem;
  max-height: 240px;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid var(--cor-borda);
}
</style>
