// Ciclo completo do MVP (docs/project.md): entra dinheiro, sai dinheiro, todos veem, o mês fecha.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { crc32, deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const CHAVE_PIX = 'gremio-e2e@exemplo.com.br';

async function pdfComTexto(linhas: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([400, 600]);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  linhas.forEach((linha, i) => pagina.drawText(linha, { x: 30, y: 560 - i * 18, size: 11, font: fonte }));
  return Buffer.from(await doc.save());
}

/** Comprovante Pix de hoje para a chave do grêmio, com E2E único. */
function comprovantePix(): Promise<Buffer> {
  const agora = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const sp = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const data = `${p(sp.getUTCDate())}/${p(sp.getUTCMonth() + 1)}/${sp.getUTCFullYear()}`;
  const e2e = `E18236120${agora.getUTCFullYear()}${p(agora.getUTCMonth() + 1)}${p(agora.getUTCDate())}0900E2E${Date.now().toString().slice(-8)}`;
  return pdfComTexto(['Comprovante Pix', 'Valor', 'R$ 20,00', 'Data', data, 'Destino', `Chave Pix ${CHAVE_PIX}`, 'ID da transacao', e2e]);
}

/** Foto de nota fiscal (PNG cinza) para o lançamento de despesa. */
function fotoNota(): Buffer {
  const [largura, altura] = [40, 60];
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(largura * 3, 235)]);
  const bloco = (tipo: string, dados: Buffer) => {
    const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(corpo) >>> 0);
    return Buffer.concat([tamanho, corpo, crc]);
  };
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(largura, 0);
  cabecalho.writeUInt32BE(altura, 4);
  cabecalho.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', cabecalho),
    bloco('IDAT', deflateSync(Buffer.concat(Array.from({ length: altura }, () => linha)))),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

async function novaPagina(browser: Browser): Promise<Page> {
  const contexto = await browser.newContext({ ...test.info().project.use });
  return contexto.newPage();
}

async function aceitarTermo(pagina: Page) {
  await expect(pagina).toHaveURL(/\/termo$/);
  await pagina.locator('.ciente input').check();
  await pagina.getByRole('button', { name: 'Concordar e continuar' }).click();
  // Primeiro acesso leva à tela de instalação (necessária para push no iPhone).
  await expect(pagina.getByRole('heading', { name: 'Instalar e receber avisos' })).toBeVisible();
}

test('ciclo completo: mensalidade, despesa, estorno, transparência e fechamento', async ({ browser }) => {
  const tesoureira = await novaPagina(browser);
  const associada = await novaPagina(browser);
  const saldo = associada.locator('.saldo');

  await test.step('tesoureira entra, aceita o termo e configura a cobrança', async () => {
    await tesoureira.goto('/');
    await expect(tesoureira).toHaveURL(/\/login$/);
    await tesoureira.fill('#re', '000000');
    await tesoureira.fill('#senha', 'trocar123');
    await tesoureira.getByRole('button', { name: 'Entrar' }).click();
    await aceitarTermo(tesoureira);

    await tesoureira.goto('/tesouraria/config');
    await tesoureira.fill('#valor', '20,00');
    await tesoureira.fill('#chave', CHAVE_PIX);
    await tesoureira.fill('#recebedor', 'GREMIO E2E');
    await tesoureira.fill('#cidade', 'SAO PAULO');
    await tesoureira.getByRole('button', { name: 'Salvar' }).click();
    await expect(tesoureira.getByText('Configuração salva.')).toBeVisible();
  });

  let codigo = '';
  await test.step('tesoureira cadastra a associada e gera as mensalidades', async () => {
    await tesoureira.goto('/tesouraria/associados');
    await tesoureira.getByRole('button', { name: 'Cadastrar associado' }).click();
    await tesoureira.fill('#nome', 'Joana Teste');
    await tesoureira.fill('#re', '555.000-1');
    await tesoureira.fill('#posto', 'Cb');
    await tesoureira.fill('#unidade', '1º GB');
    await tesoureira.getByRole('button', { name: 'Cadastrar e gerar código' }).click();
    codigo = (await tesoureira.locator('.codigo-convite').textContent())!.trim();
    expect(codigo).toMatch(/^[A-Z0-9]{8}$/);

    await tesoureira.goto('/tesouraria/mensalidades');
    await tesoureira.getByRole('button', { name: /Gerar mensalidades/ }).click();
    await expect(tesoureira.locator('.alerta-ok')).toContainText('2 mensalidade(s) criada(s)');
  });

  await test.step('associada ativa o acesso e paga com o comprovante Pix (baixa automática)', async () => {
    await associada.goto('/ativar');
    await associada.fill('#re', '5550001');
    await associada.fill('#codigo', codigo.toLowerCase());
    await associada.fill('#senha', 'senha-da-joana');
    await associada.fill('#confirmacao', 'senha-da-joana');
    await associada.getByRole('button', { name: 'Ativar' }).click();
    await aceitarTermo(associada);

    await associada.getByRole('link', { name: 'Mensalidade', exact: true }).click();
    await associada.getByRole('button', { name: 'Pagar' }).click();
    await expect(associada.locator('img.qr')).toBeVisible();
    await associada.locator('input[type=file]').setInputFiles({
      name: 'comprovante.pdf',
      mimeType: 'application/pdf',
      buffer: await comprovantePix(),
    });
    await expect(associada.locator('.etiqueta', { hasText: 'Paga' })).toBeVisible({ timeout: 60_000 });

    await associada.goto('/');
    await expect(saldo).toHaveText(/R\$\s*20,00/);
  });

  let urlDespesa = '';
  await test.step('tesoureira lança uma despesa com foto e todos veem', async () => {
    await tesoureira.goto('/tesouraria/lancar');
    await tesoureira.locator('#categoria').selectOption({ label: 'Café' });
    await tesoureira.fill('#valor', '7,50');
    await tesoureira.fill('#descricao', 'Filtros de papel para a cafeteira');
    await tesoureira.locator('#arquivo').setInputFiles({ name: 'nota.png', mimeType: 'image/png', buffer: fotoNota() });
    await expect(tesoureira.locator('img.previa')).toBeVisible();
    await tesoureira.getByRole('button', { name: 'Lançar' }).click();
    await expect(tesoureira).toHaveURL(/\/extrato\/[0-9a-f-]{36}$/);
    urlDespesa = new URL(tesoureira.url()).pathname;

    await associada.reload();
    await expect(saldo).toHaveText(/R\$\s*12,50/);
    await associada.goto(urlDespesa);
    await expect(associada.getByRole('button', { name: 'Ver comprovante' })).toBeVisible();
    // Só o tesoureiro estorna.
    await expect(associada.getByRole('button', { name: 'Estornar lançamento' })).toHaveCount(0);
  });

  await test.step('tesoureira estorna a despesa com motivo', async () => {
    await tesoureira.getByRole('button', { name: 'Estornar lançamento' }).click();
    await tesoureira.fill('#motivo', 'Lançada em duplicidade');
    await tesoureira.getByRole('button', { name: 'Confirmar estorno' }).click();
    await expect(tesoureira.getByText('Este lançamento desfaz')).toBeVisible();

    await associada.goto('/');
    await expect(saldo).toHaveText(/R\$\s*20,00/);
    await associada.goto('/extrato');
    await expect(associada.locator('.etiqueta', { hasText: 'estornado' })).toBeVisible();
  });

  await test.step('tesoureira fecha o mês anterior e a prestação de contas fica disponível a todos', async () => {
    await tesoureira.goto('/tesouraria/fechamento');
    await expect(tesoureira.getByText('Saldo no sistema')).toBeVisible();
    await tesoureira.fill('#saldo', '0,00');
    await tesoureira.locator('#extrato').setInputFiles({
      name: 'extrato.pdf',
      mimeType: 'application/pdf',
      buffer: await pdfComTexto(['Extrato de conta corrente', 'Sem movimentacao no periodo', 'Saldo final 0,00']),
    });
    await tesoureira.locator('.ciente input').check();
    await tesoureira.getByRole('button', { name: /^Fechar / }).click();
    await expect(tesoureira).toHaveURL(/\/fechamentos$/);
    await expect(tesoureira.getByText('confere com o banco')).toBeVisible();
    // O PDF é gerado na fila (Puppeteer).
    await expect(tesoureira.getByRole('button', { name: 'Baixar prestação de contas' })).toBeVisible({ timeout: 90_000 });

    await associada.goto('/fechamentos');
    await expect(associada.getByRole('button', { name: 'Baixar prestação de contas' })).toBeVisible();
    // O extrato do banco identifica quem pagou: só o tesoureiro abre.
    await expect(associada.getByRole('button', { name: 'Extrato do banco' })).toHaveCount(0);
  });
});
