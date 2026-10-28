<script setup lang="ts">
import { formatarCentavos, type CobrancaPixDto, type MensalidadeDto } from '@gremio/shared';

const props = defineProps<{ mensalidade: MensalidadeDto }>();
const emit = defineEmits<{ enviado: [MensalidadeDto] }>();

const api = useApi();
const { data: pix, error: erroPix } = useAsyncData(`pix-${props.mensalidade.id}`, () =>
  api<CobrancaPixDto>(`/api/mensalidades/${props.mensalidade.id}/pix`),
);

const copiado = ref(false);
async function copiar() {
  if (!pix.value) return;
  await navigator.clipboard.writeText(pix.value.copiaECola);
  copiado.value = true;
  setTimeout(() => (copiado.value = false), 2500);
}

const enviando = ref(false);
const erro = ref('');
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

async function enviar(evento: Event) {
  const entrada = evento.target as HTMLInputElement;
  const arquivo = entrada.files?.[0];
  entrada.value = '';
  if (!arquivo) return;
  erro.value = '';
  if (arquivo.type !== 'application/pdf') {
    erro.value = 'Envie o comprovante em PDF. No app do banco, use “Compartilhar comprovante” → PDF.';
    return;
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    erro.value = 'O arquivo passa de 5 MB.';
    return;
  }
  const corpo = new FormData();
  corpo.append('arquivo', arquivo);
  enviando.value = true;
  try {
    emit('enviado', await api<MensalidadeDto>(`/api/mensalidades/${props.mensalidade.id}/comprovante`, {
      method: 'POST',
      body: corpo,
    }));
  } catch (e) {
    erro.value = lerErro(e).mensagem;
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div class="pagar">
    <div v-if="erroPix" class="alerta alerta-erro">{{ lerErro(erroPix).mensagem }}</div>
    <p v-else-if="!pix" class="suave">Gerando o Pix…</p>
    <template v-else-if="pix">
      <p class="passo"><strong>1.</strong> Pague {{ formatarCentavos(pix.valor) }} pelo Pix</p>
      <img :src="pix.qrCode" alt="QR Code do Pix" class="qr" width="220" height="220" />
      <p class="suave centro">Recebedor: {{ pix.nomeRecebedor }} · chave {{ pix.chavePix }}</p>
      <button type="button" class="botao botao-secundario botao-largo" @click="copiar">
        {{ copiado ? 'Código copiado!' : 'Copiar código Pix (copia e cola)' }}
      </button>

      <p class="passo"><strong>2.</strong> Envie o comprovante em PDF</p>
      <div v-if="erro" class="alerta alerta-erro" role="alert">{{ erro }}</div>
      <label class="botao botao-largo" :class="{ desabilitado: enviando }">
        {{ enviando ? 'Enviando…' : 'Escolher comprovante (PDF)' }}
        <input type="file" accept="application/pdf" class="oculto" :disabled="enviando" @change="enviar" />
      </label>
      <p class="suave">O sistema confere o comprovante e dá a baixa sozinho. Se algo não bater, o tesoureiro revisa.</p>
    </template>
  </div>
</template>

<style scoped>
.pagar {
  border-top: 1px solid var(--cor-borda);
  margin-top: 0.75rem;
  padding-top: 0.75rem;
}

.passo {
  margin: 0.75rem 0 0.5rem;
}

.qr {
  display: block;
  margin: 0 auto;
  max-width: 100%;
  height: auto;
  image-rendering: pixelated;
}

.centro {
  text-align: center;
}

.oculto {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.desabilitado {
  opacity: 0.6;
  pointer-events: none;
}
</style>
