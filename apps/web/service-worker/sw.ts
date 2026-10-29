/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// Cache do app para abrir rápido e funcionar com sinal fraco. Os dados vêm sempre da API.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Com registerType 'autoUpdate', a versão nova precisa assumir sozinha: sem isso ela fica
// esperando fechar todas as janelas do app, o que no PWA instalado quase nunca acontece.
// Ao assumir, o plugin recarrega a página aberta.
self.skipWaiting();
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));

// Notificações de cada lançamento (Web Push). O envio é ligado na semana 3.
self.addEventListener('push', (evento) => {
  const dados = evento.data?.json() ?? {};
  evento.waitUntil(
    self.registration.showNotification(dados.titulo ?? 'Grêmio', {
      body: dados.corpo,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: dados.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const url = evento.notification.data?.url ?? '/';
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      const aberta = janelas.find((j) => 'focus' in j);
      if (aberta) {
        aberta.navigate(url);
        return aberta.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
