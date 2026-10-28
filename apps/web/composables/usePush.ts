// Notificações Web Push. No iPhone só funcionam com o app adicionado à tela inicial (iOS 16.4+).

export type EstadoPush = 'carregando' | 'sem-suporte' | 'precisa-instalar' | 'bloqueado' | 'desligado' | 'ligado';

function base64UrlParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

export function ehIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function estaInstalado(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function usePush() {
  const api = useApi();
  const estado = ref<EstadoPush>('carregando');
  const erro = ref('');

  async function inscricaoAtual(): Promise<PushSubscription | null> {
    const registro = await navigator.serviceWorker.getRegistration();
    return (await registro?.pushManager.getSubscription()) ?? null;
  }

  async function atualizar() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      estado.value = ehIos() && !estaInstalado() ? 'precisa-instalar' : 'sem-suporte';
      return;
    }
    if (Notification.permission === 'denied') {
      estado.value = 'bloqueado';
      return;
    }
    estado.value = (await inscricaoAtual()) ? 'ligado' : 'desligado';
  }

  async function ligar() {
    erro.value = '';
    try {
      const { chave } = await api<{ chave: string | null }>('/api/notificacoes/chave');
      if (!chave) throw new Error('O servidor ainda não está configurado para notificações.');
      // Precisa ser chamado direto do toque do usuário, senão o navegador recusa.
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        estado.value = permissao === 'denied' ? 'bloqueado' : 'desligado';
        return;
      }
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlParaBytes(chave),
      });
      await api('/api/notificacoes/inscricao', { method: 'POST', body: inscricao.toJSON() });
      estado.value = 'ligado';
    } catch (e) {
      erro.value = e instanceof Error && !('statusCode' in e) ? e.message : lerErro(e).mensagem;
    }
  }

  async function desligar() {
    erro.value = '';
    const inscricao = await inscricaoAtual();
    if (inscricao) {
      await api('/api/notificacoes/inscricao', { method: 'DELETE', body: { endpoint: inscricao.endpoint } }).catch(() => {});
      await inscricao.unsubscribe();
    }
    estado.value = 'desligado';
  }

  onMounted(atualizar);
  return { estado, erro, ligar, desligar };
}
