import { defineConfig, devices } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AMBIENTE_API, PORTA_API, PORTA_APP, URL_APP } from './e2e/ambiente';

// Ciclo completo contra um build de produção, com API e banco isolados. Precisa da
// infraestrutura de dev no ar (pnpm infra:up). Rode com: pnpm --filter @gremio/web e2e
// (o script prepara banco e builds antes de o Playwright subir os servidores).
const pasta = dirname(fileURLToPath(import.meta.url));

// E2E_URL roda o teste contra uma stack já no ar (ex.: docker-compose.prod.yml local).
// O teste cria dados e fecha um mês: use só em ambiente descartável, nunca no do grêmio.
const urlExterna = process.env.E2E_URL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: urlExterna ?? URL_APP,
    ignoreHTTPSErrors: !!urlExterna,
    ...devices['Pixel 7'],
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  webServer: urlExterna
    ? undefined
    : [
        {
          command: 'node dist/main.js',
          cwd: join(pasta, '..', 'api'),
          env: AMBIENTE_API,
          url: `http://127.0.0.1:${PORTA_API}/api/health`,
          reuseExistingServer: false,
          timeout: 60_000,
        },
        {
          command: `node e2e/servidor.mjs ${PORTA_APP} http://127.0.0.1:${PORTA_API} .output/public`,
          url: URL_APP,
          reuseExistingServer: false,
        },
      ],
});
