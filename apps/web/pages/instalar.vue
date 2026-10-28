<script setup lang="ts">
const { estado, erro, ligar, desligar } = usePush();
const plataforma = ref<'ios' | 'outro'>('outro');
const instalado = ref(false);
onMounted(() => {
  plataforma.value = ehIos() ? 'ios' : 'outro';
  instalado.value = estaInstalado();
});
</script>

<template>
  <div>
    <h1>Instalar e receber avisos</h1>
    <p class="suave">
      O app do grêmio não está nas lojas: ele é instalado direto pelo navegador e avisa você a cada despesa
      lançada.
    </p>

    <section class="cartao">
      <h2>1. Adicione à tela inicial</h2>
      <p v-if="instalado" class="alerta alerta-ok">Pronto, o app já está instalado neste aparelho.</p>
      <ol v-else-if="plataforma === 'ios'">
        <li>Abra este endereço no <strong>Safari</strong>.</li>
        <li>Toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima).</li>
        <li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme.</li>
        <li>Abra o app pelo ícone novo e volte a esta tela para ligar os avisos.</li>
      </ol>
      <ol v-else>
        <li>No Chrome, toque no menu <strong>⋮</strong>.</li>
        <li>Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
      </ol>
    </section>

    <section class="cartao">
      <h2>2. Ligue os avisos</h2>
      <div v-if="erro" class="alerta alerta-erro" role="alert">{{ erro }}</div>
      <p v-if="estado === 'carregando'" class="suave">Verificando…</p>
      <p v-else-if="estado === 'precisa-instalar'">
        No iPhone, os avisos só funcionam com o app instalado na tela inicial (iOS 16.4 ou mais novo). Faça o passo 1
        e abra o app pelo ícone.
      </p>
      <p v-else-if="estado === 'sem-suporte'">Este navegador não aceita avisos. Use o Chrome ou o Safari atualizados.</p>
      <p v-else-if="estado === 'bloqueado'">
        Os avisos foram bloqueados. Libere nas configurações do navegador (permissões do site) e volte aqui.
      </p>
      <template v-else-if="estado === 'ligado'">
        <p class="alerta alerta-ok">Avisos ligados neste aparelho.</p>
        <button class="botao botao-secundario" @click="desligar">Desligar avisos</button>
      </template>
      <button v-else class="botao botao-largo" @click="ligar">Ligar avisos</button>
    </section>
  </div>
</template>

<style scoped>
h2:first-child {
  margin-top: 0;
}

ol {
  margin: 0;
  padding-left: 1.25rem;
}

li {
  margin-bottom: 0.35rem;
}
</style>
