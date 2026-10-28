<script setup lang="ts">
import {
  criarAssociadoSchema,
  Perfil,
  Situacao,
  type AssociadoDto,
  type ConviteDto,
} from '@gremio/shared';

const api = useApi();
const { data: associados, refresh } = await useAsyncData('associados', () => api<AssociadoDto[]>('/api/associados'));

const busca = ref('');
const filtrados = computed(() => {
  const termo = busca.value.trim().toLowerCase();
  if (!termo) return associados.value ?? [];
  return (associados.value ?? []).filter((a) => a.nome.toLowerCase().includes(termo) || a.re.includes(termo));
});

// Convite mostrado depois de cadastrar ou gerar um novo código.
const convite = ref<{ nome: string; re: string; dados: ConviteDto } | null>(null);

const mostrarForm = ref(false);
const form = reactive({ nome: '', re: '', posto: '', unidade: '' });
const errosForm = ref<Record<string, string>>({});
const erroForm = ref('');
const salvando = ref(false);

async function cadastrar() {
  erroForm.value = '';
  errosForm.value = {};
  const dados = criarAssociadoSchema.safeParse(form);
  if (!dados.success) {
    for (const issue of dados.error.issues) errosForm.value[String(issue.path[0])] = issue.message;
    return;
  }
  salvando.value = true;
  try {
    const criado = await api<{ associado: AssociadoDto; convite: ConviteDto }>('/api/associados', {
      method: 'POST',
      body: dados.data,
    });
    convite.value = { nome: criado.associado.nome, re: criado.associado.re, dados: criado.convite };
    Object.assign(form, { nome: '', re: '', posto: '', unidade: '' });
    mostrarForm.value = false;
    await refresh();
  } catch (e) {
    const { mensagem, campos } = lerErro(e);
    erroForm.value = mensagem;
    errosForm.value = campos;
  } finally {
    salvando.value = false;
  }
}

const erroLista = ref('');

async function atualizar(associado: AssociadoDto, dados: Partial<AssociadoDto>) {
  erroLista.value = '';
  try {
    await api(`/api/associados/${associado.id}`, { method: 'PATCH', body: dados });
  } catch (e) {
    erroLista.value = `${associado.nome}: ${lerErro(e).mensagem}`;
  }
  await refresh();
}

async function novoConvite(associado: AssociadoDto) {
  erroLista.value = '';
  try {
    const dados = await api<ConviteDto>(`/api/associados/${associado.id}/convite`, { method: 'POST' });
    convite.value = { nome: associado.nome, re: associado.re, dados };
  } catch (e) {
    erroLista.value = lerErro(e).mensagem;
  }
}

const formatarData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
</script>

<template>
  <div>
    <h1>Associados</h1>

    <div v-if="convite" class="cartao convite" role="status">
      <strong>Código de acesso de {{ convite.nome }}</strong>
      <div class="codigo-convite">{{ convite.dados.codigo }}</div>
      <p class="suave">
        Passe este código pessoalmente. O associado entra em “Ativar acesso” com o RE {{ convite.re }} e cria a
        própria senha. Vale até {{ formatarData(convite.dados.expiraEm) }} e não será mostrado de novo.
      </p>
      <button class="botao botao-secundario" @click="convite = null">Fechar</button>
    </div>

    <button v-if="!mostrarForm" class="botao botao-largo" @click="mostrarForm = true">Cadastrar associado</button>

    <form v-else class="cartao" @submit.prevent="cadastrar">
      <div v-if="erroForm" class="alerta alerta-erro" role="alert">{{ erroForm }}</div>
      <div class="campo">
        <label for="nome">Nome</label>
        <input id="nome" v-model="form.nome" autocomplete="off" required />
        <span v-if="errosForm.nome" class="erro-campo">{{ errosForm.nome }}</span>
      </div>
      <div class="campo">
        <label for="re">RE</label>
        <input id="re" v-model="form.re" inputmode="numeric" required />
        <span v-if="errosForm.re" class="erro-campo">{{ errosForm.re }}</span>
      </div>
      <div class="linha">
        <div class="campo">
          <label for="posto">Posto/graduação</label>
          <input id="posto" v-model="form.posto" required />
          <span v-if="errosForm.posto" class="erro-campo">{{ errosForm.posto }}</span>
        </div>
        <div class="campo">
          <label for="unidade">Unidade</label>
          <input id="unidade" v-model="form.unidade" required />
          <span v-if="errosForm.unidade" class="erro-campo">{{ errosForm.unidade }}</span>
        </div>
      </div>
      <div class="acoes">
        <button class="botao" :disabled="salvando">Cadastrar e gerar código</button>
        <button type="button" class="botao botao-secundario" @click="mostrarForm = false">Cancelar</button>
      </div>
    </form>

    <h2>{{ associados?.length ?? 0 }} cadastrados</h2>
    <input v-model="busca" type="search" placeholder="Buscar por nome ou RE" class="busca" />
    <div v-if="erroLista" class="alerta alerta-erro" role="alert">{{ erroLista }}</div>

    <ul class="lista">
      <li v-for="a in filtrados" :key="a.id" class="cartao">
        <div class="cabecalho">
          <div>
            <strong>{{ a.nome }}</strong>
            <div class="suave">{{ a.posto }} · RE {{ a.re }} · {{ a.unidade }}</div>
          </div>
          <span :class="['etiqueta', `etiqueta-${a.situacao}`]">{{ a.situacao.toLowerCase() }}</span>
        </div>
        <p v-if="!a.ativado" class="suave">Ainda não ativou o acesso.</p>
        <div class="linha">
          <div class="campo">
            <label :for="`sit-${a.id}`">Situação</label>
            <select
              :id="`sit-${a.id}`"
              :value="a.situacao"
              @change="atualizar(a, { situacao: ($event.target as HTMLSelectElement).value as Situacao })"
            >
              <option :value="Situacao.ATIVO">Ativo</option>
              <option :value="Situacao.INADIMPLENTE">Inadimplente</option>
              <option :value="Situacao.ISENTO">Isento</option>
            </select>
          </div>
          <div class="campo">
            <label :for="`perfil-${a.id}`">Perfil</label>
            <select
              :id="`perfil-${a.id}`"
              :value="a.perfil"
              @change="atualizar(a, { perfil: ($event.target as HTMLSelectElement).value as Perfil })"
            >
              <option :value="Perfil.ASSOCIADO">Associado</option>
              <option :value="Perfil.TESOUREIRO">Tesoureiro</option>
            </select>
          </div>
        </div>
        <button class="botao botao-secundario" @click="novoConvite(a)">
          {{ a.ativado ? 'Gerar código para redefinir senha' : 'Gerar novo código' }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.linha {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0 0.75rem;
}

.acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.busca {
  margin-bottom: 1rem;
}

.lista {
  list-style: none;
  padding: 0;
  margin: 0;
}

.cabecalho {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.convite {
  border-color: var(--cor-marca);
}
</style>
