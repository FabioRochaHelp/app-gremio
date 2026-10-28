// Dados iniciais: tesoureiro, configuração de cobrança e categorias de despesa.
// O valor da mensalidade e a chave Pix são provisórios até o grêmio defini-los
// (ver "próximos passos" em docs/project.md); o tesoureiro ajusta na tela de configuração.
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const re = process.env.SEED_TESOUREIRO_RE ?? '000000';
  const senha = process.env.SEED_TESOUREIRO_SENHA ?? 'trocar123';

  await prisma.associado.upsert({
    where: { re },
    create: {
      re,
      nome: process.env.SEED_TESOUREIRO_NOME ?? 'Tesoureiro',
      posto: 'A definir',
      unidade: 'A definir',
      perfil: 'TESOUREIRO',
      senhaHash: await hash(senha, 12),
    },
    update: {},
  });

  await prisma.config.upsert({
    where: { id: 1 },
    create: {
      valorMensalidade: 2000,
      chavePix: 'definir@chave.pix',
      cnpj: null,
      nomeRecebedor: 'GREMIO',
      cidade: 'SAO PAULO',
    },
    update: {},
  });

  for (const nome of ['Café', 'Reparos', 'Eventos']) {
    await prisma.categoria.upsert({ where: { nome }, create: { nome }, update: {} });
  }

  console.log(`Seed concluído. Tesoureiro: RE ${re}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
