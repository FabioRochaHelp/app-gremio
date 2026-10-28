// Recria o banco de teste do zero a cada execução. Derrubar o schema é a única forma
// de limpar tabelas protegidas pelos triggers de imutabilidade.
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { URL_BANCO_TESTE } from './env';

export default async function setup() {
  const banco = new URL(URL_BANCO_TESTE).pathname.slice(1);
  if (!banco.endsWith('_test')) {
    throw new Error(`Recusando limpar "${banco}": o banco de teste precisa terminar em _test`);
  }

  const prisma = new PrismaClient({ datasourceUrl: URL_BANCO_TESTE });
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  await prisma.$disconnect();

  execSync('pnpm exec prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: URL_BANCO_TESTE },
    stdio: 'ignore',
  });
}
