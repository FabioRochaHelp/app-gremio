// Renderiza HTML (stdin) em PDF (stdout) com o Puppeteer, fora do Jest.
import puppeteer from 'puppeteer';

let html = '';
for await (const parte of process.stdin) html += parte;
const navegador = await puppeteer.launch({ headless: true });
try {
  const pagina = await navegador.newPage();
  await pagina.setContent(html, { waitUntil: 'load' });
  process.stdout.write(await pagina.pdf({ format: 'A4', printBackground: true }));
} finally {
  await navegador.close();
}
