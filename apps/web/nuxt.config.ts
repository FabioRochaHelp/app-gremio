// PWA instalado pelo link, sem lojas. Roda como SPA: a API é a única fonte de dados.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-01',
  ssr: false,
  devtools: { enabled: false },
  devServer: { port: 3000 },
  // O teste E2E gera um build próprio sem mexer no .nuxt do servidor de desenvolvimento.
  buildDir: process.env.NUXT_BUILD_DIR || '.nuxt',
  modules: ['@pinia/nuxt', '@vite-pwa/nuxt'],
  css: ['~/assets/base.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      title: 'Grêmio',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#7a1f1f' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'icon', href: '/icone.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
      ],
    },
  },

  // Em dev, o Nuxt repassa /api para o NestJS; em produção quem faz isso é o Caddy.
  // Assim API e PWA ficam na mesma origem e o cookie de refresh funciona sem CORS.
  nitro: {
    devProxy: {
      '/api': { target: 'http://127.0.0.1:4000/api', changeOrigin: true },
    },
  },

  pwa: {
    strategies: 'injectManifest',
    srcDir: 'service-worker',
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    manifest: {
      name: 'Grêmio — Transparência',
      short_name: 'Grêmio',
      description: 'Contribuições e gastos do grêmio, com comprovantes visíveis a todos os associados',
      lang: 'pt-BR',
      theme_color: '#7a1f1f',
      background_color: '#faf7f2',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
    },
    devOptions: {
      enabled: false,
      type: 'module',
    },
  },
});
