# App do Grêmio

PWA de transparência financeira do grêmio. Visão geral e regras em [docs/project.md](docs/project.md).

```
apps/api         NestJS + Prisma (PostgreSQL)
apps/web         Nuxt 3 (SPA/PWA) + Pinia
packages/shared  enums, schemas zod e utilitários usados pelos dois lados
infra/           Docker Compose de desenvolvimento
```

## Rodando em desenvolvimento

Requisitos: Node 22+, pnpm (`corepack enable pnpm`) e Docker.

```bash
pnpm install
pnpm infra:up                      # PostgreSQL, Redis e S3 (SeaweedFS)
cp .env.example apps/api/.env
pnpm build:shared
pnpm --filter @gremio/api exec prisma migrate deploy
pnpm --filter @gremio/api seed     # tesoureiro RE 000000 / senha trocar123
pnpm dev                           # API em :4000 e app em http://localhost:3000
```

O app (porta 3000) repassa `/api` para a API (porta 4000), então os dois precisam estar rodando.
Se preferir terminais separados: `pnpm dev:api` e `pnpm dev:web`. Rode cada um uma vez só: um segundo
`nuxt dev` ocupa outra porta e o app parece não carregar.

Depois de mudar `packages/shared`, rode `pnpm build:shared` (ou `pnpm --filter @gremio/shared dev` em modo watch).

## Testes

```bash
pnpm --filter @gremio/shared test
# Integração: usa o banco gremio_test, recriado a cada execução.
docker compose -f infra/docker-compose.yml exec postgres createdb -U gremio gremio_test   # só na primeira vez
pnpm --filter @gremio/api test
# Ciclo completo no navegador (build de produção, banco gremio_e2e recriado a cada execução).
# Na primeira vez: pnpm --filter @gremio/web exec playwright install chromium
pnpm --filter @gremio/web e2e
# Contra uma stack já no ar (ex.: docker-compose.prod.yml numa máquina de teste). O teste cria dados
# e fecha um mês: use só em ambiente descartável, nunca no do grêmio.
E2E_URL=https://localhost:18443 pnpm --filter @gremio/web exec playwright test
```

## Regras que o código garante

- **Lançamentos imutáveis**: `lancamentos`, `audit_log` e `fechamentos_mensais` não aceitam UPDATE/DELETE,
  nem pelo Prisma ([apps/api/src/prisma/extensoes.ts](apps/api/src/prisma/extensoes.ts)) nem direto no banco
  (triggers na migration `init`). Correção é estorno, uma vez por lançamento.
- **Auditoria**: toda escrita nos demais modelos vai para `audit_log` com o autor da requisição.
- **Acesso**: login por RE + senha; o primeiro acesso usa um código de convite gerado pelo tesoureiro.
  Nada funciona antes do aceite do termo de uso; a situação dos associados (inadimplência) é visível só ao tesoureiro.
- **Dinheiro em centavos** (inteiro) e competência como `YYYY-MM` no fuso de São Paulo.

## Mensalidades e baixa automática

1. No dia 1 de cada mês a fila gera as mensalidades (o tesoureiro também pode gerar pela tela).
2. O associado paga pelo QR Code Pix (BR Code estático com a chave do grêmio) e envia o comprovante em PDF.
3. A fila lê o PDF ([apps/api/src/comprovantes/](apps/api/src/comprovantes/)) e aplica as 4 checagens:
   leitura (valor, data e ID E2E), recebedor (chave Pix ou CNPJ do grêmio), valor e data compatíveis
   com a competência (mês anterior até o seguinte) e E2E nunca usado.
4. Passou: a mensalidade fica paga e entra uma ENTRADA no caixa, sem o nome do associado (quem pagou
   é informação só do tesoureiro). Falhou: vai para a revisão do tesoureiro com o motivo.

A leitura usa um leitor genérico que cobre os rótulos usuais dos bancos. Quando um banco não for lido
direito, adicione o texto real anonimizado como caso em
[comprovantes.spec.ts](apps/api/src/comprovantes/comprovantes.spec.ts) e, se preciso, regras próprias em
`REGRAS_POR_BANCO` ([leitura.ts](apps/api/src/comprovantes/leitura.ts)).

## Lançamentos, extrato e avisos

- O tesoureiro lança despesas (com categoria) e entradas avulsas; a foto da nota ou recibo é obrigatória
  (JPG, PNG, WEBP, HEIC ou PDF; fotos grandes são reduzidas no celular antes do envio).
- Todos veem o extrato, o painel e o comprovante de cada despesa. **Exceção (LGPD):** nas entradas de
  mensalidade, o pagador e o comprovante Pix ficam restritos ao tesoureiro e ao próprio associado, porque
  revelariam quem pagou e, por exclusão, quem não pagou.
- Estorno cria um lançamento que desfaz o original, com motivo; cada lançamento só pode ser estornado uma vez.
  Estornar a baixa de uma mensalidade a reabre, e o mesmo comprovante não é aceito de novo.
- Mês já fechado não aceita lançamentos com data nele.
- Cada despesa, entrada avulsa ou estorno dispara um Web Push para todos os aparelhos inscritos (fila
  `notificacoes`). Gere as chaves VAPID com `npx web-push generate-vapid-keys` e preencha `VAPID_*` no `.env`.
  O service worker só é registrado no build de produção (`pnpm --filter @gremio/web build`); no iPhone o push
  exige o app instalado na tela inicial (iOS 16.4+), e o primeiro acesso leva à tela `/instalar`.

## Fechamento do mês

O tesoureiro fecha um mês já terminado informando o saldo do banco no último dia e anexando o extrato
em PDF. O sistema compara o saldo registrado com o do banco e procura no extrato o crédito de cada
mensalidade baixada (pelo ID E2E ou por valor e dia). As diferenças viram divergências, sem impedir o
fechamento. A fila gera então o PDF de prestação de contas (Puppeteer), com resumo, divergências,
extrato do mês e os comprovantes das despesas, e avisa todos.

- O fechamento é definitivo e trava lançamentos no mês fechado **e nos anteriores** (um lançamento
  retroativo mudaria um saldo já publicado). Baixas que chegam depois entram no mês corrente.
- O extrato do banco lista quem fez cada Pix: fica só com o tesoureiro e não entra no PDF público,
  assim como os comprovantes de mensalidade.

Em dev as filas rodam dentro da API. Em produção, a API roda com `PROCESSAR_FILAS=false` e o worker
separado com `node dist/worker.js`.

## Armazenamento de arquivos

O plano previa MinIO, mas as imagens públicas do MinIO deixaram de ser publicadas. Em dev usamos o
SeaweedFS, que também fala S3; em produção pode ser ele ou o Cloudflare R2, trocando só as variáveis `S3_*`.

## Produção

Uma VPS com Docker (2 vCPU, 2 a 4 GB). Aponte o DNS de `DOMINIO` e de `arquivos.DOMINIO` para ela e
configure o proxy reverso do servidor (com HTTPS) para repassar os dois para `127.0.0.1:3000`,
preservando o cabeçalho `Host`.

```bash
cd infra
cp .env.prod.example .env.prod          # preencha senhas, segredos JWT, chaves VAPID e domínio
cp s3.prod.json.example s3.prod.json    # troque a chave (a mesma de S3_SECRET_KEY)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
# Só na primeira vez: cria o tesoureiro inicial, a configuração e as categorias.
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm api node_modules/.bin/ts-node prisma/seed.ts
```

Serviços: `caddy` (porta 3000: PWA estático, proxy de `/api` e de `arquivos.DOMINIO`), `api`, `worker` (filas, leitura
de comprovantes, avisos e PDF mensal), `migrate` (aplica as migrations antes da API subir), `postgres`,
`redis`, `s3` (SeaweedFS, comprovantes e PDFs em `arquivos.DOMINIO`) e `backup`.

O `backup` grava todo dia em `infra/backups` o banco (`pg_dump`) e os arquivos, guardando 14 dias.
**Copie essa pasta para fora da VPS** (outro provedor, nuvem ou HD): backup só na mesma máquina não
protege contra a perda dela. Para restaurar o banco: `pg_restore -d gremio banco-AAAA-MM-DD.dump`.
