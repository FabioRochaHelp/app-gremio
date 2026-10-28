// Antes do E2E: recria o banco gremio_e2e, aplica as migrations, roda o seed e compila
// a API e o app de produção (com service worker). Roda antes do Playwright subir os servidores.
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BANCO = 'gremio_e2e';
const URL_BANCO = `postgresql://gremio:gremio@localhost:5432/${BANCO}?schema=public`;
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const api = join(raiz, 'apps', 'api');
const ambienteApi = {
  DATABASE_URL: URL_BANCO,
  SEED_TESOUREIRO_RE: '000000',
  SEED_TESOUREIRO_SENHA: 'trocar123',
  SEED_TESOUREIRO_NOME: 'Tesoureira E2E',
};

function rodar(comando, cwd, env = {}) {
  execSync(comando, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
}

// Derrubar o schema é o único jeito de limpar as tabelas imutáveis.
const psql = (sql, banco = 'gremio') =>
  rodar(`docker compose -f infra/docker-compose.yml exec -T postgres psql -U gremio -d ${banco} -c "${sql}"`, raiz);
try {
  psql(`CREATE DATABASE ${BANCO}`);
} catch {
  // já existe
}
psql('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;', BANCO);

rodar('pnpm exec prisma migrate deploy', api, ambienteApi);
rodar('pnpm seed', api, ambienteApi);
rodar('pnpm --filter @gremio/shared build', raiz);
rodar('pnpm build', api);
rodar('pnpm exec nuxt generate', join(raiz, 'apps', 'web'), { NUXT_BUILD_DIR: '.nuxt-e2e' });
