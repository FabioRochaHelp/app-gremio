// Prestação de contas mensal em PDF: resumo, divergências da conferência bancária,
// extrato do mês e, ao final, os comprovantes das despesas e entradas avulsas.
// Comprovantes de mensalidade e o extrato do banco ficam fora: identificam quem pagou.

import { formatarCentavos, rotuloCompetencia, textoDivergencia, type Divergencia } from '@gremio/shared';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface LinhaExtrato {
  data: Date;
  descricao: string;
  tipo: string;
  autor: string;
  efeito: number;
  estornado: boolean;
  anexo: number | null;
}

export interface DadosRelatorio {
  nomeGremio: string;
  competencia: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  saldoSistema: number;
  saldoBanco: number;
  divergencias: Divergencia[];
  categorias: { nome: string; total: number }[];
  mensalidades: { pagas: number; emAberto: number; isentas: number; total: number };
  linhas: LinhaExtrato[];
  fechadoPor: string;
  fechadoEm: Date;
}

export interface Anexo {
  numero: number;
  titulo: string;
  conteudo: Buffer;
  contentType: string;
}

const esc = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const dataSp = (data: Date, comHora = false) =>
  data.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    ...(comHora ? { timeStyle: 'short' } : {}),
  });

const sinal = (centavos: number) => `${centavos >= 0 ? '+' : '−'} ${formatarCentavos(Math.abs(centavos))}`;

export function montarHtml(d: DadosRelatorio): string {
  const titulo = `Prestação de contas — ${rotuloCompetencia(d.competencia)}`;
  const linhas = d.linhas
    .map(
      (l) => `<tr${l.estornado ? ' class="estornado"' : ''}>
        <td>${dataSp(l.data)}</td>
        <td>${esc(l.descricao)}${l.estornado ? ' <em>(estornado)</em>' : ''}</td>
        <td>${esc(l.tipo)}</td>
        <td>${esc(l.autor)}</td>
        <td class="num">${sinal(l.efeito)}</td>
        <td class="num">${l.anexo ?? '—'}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.45 "DejaVu Sans", Arial, sans-serif; color: #1f1b16; margin: 0; }
  h1 { font-size: 17pt; margin: 0 0 2pt; color: #7a1f1f; }
  h2 { font-size: 12pt; margin: 18pt 0 6pt; border-bottom: 1px solid #ccc; padding-bottom: 3pt; }
  .sub { color: #6b625a; margin: 0 0 12pt; }
  .resumo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6pt; }
  .resumo div { border: 1px solid #ddd; border-radius: 4pt; padding: 6pt 8pt; }
  .resumo span { display: block; color: #6b625a; font-size: 9pt; }
  .resumo strong { font-size: 12pt; }
  .alerta { background: #fdecea; border: 1px solid #e7b4ad; border-radius: 4pt; padding: 8pt 10pt; }
  .alerta li { margin-bottom: 3pt; }
  .ok { background: #e7f5ec; border: 1px solid #a9d8ba; border-radius: 4pt; padding: 8pt 10pt; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th, td { text-align: left; padding: 4pt 5pt; border-bottom: 1px solid #e4ddd3; vertical-align: top; }
  th { background: #f5f1eb; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr { page-break-inside: avoid; }
  .estornado td { color: #6b625a; }
  .nota { color: #6b625a; font-size: 9pt; }
</style></head><body>
  <h1>${esc(titulo)}</h1>
  <p class="sub">${esc(d.nomeGremio)} · fechado por ${esc(d.fechadoPor)} em ${dataSp(d.fechadoEm, true)}</p>

  <div class="resumo">
    <div><span>Saldo inicial</span><strong>${formatarCentavos(d.saldoInicial)}</strong></div>
    <div><span>Entradas</span><strong>${formatarCentavos(d.entradas)}</strong></div>
    <div><span>Saídas</span><strong>${formatarCentavos(d.saidas)}</strong></div>
    <div><span>Saldo no sistema</span><strong>${formatarCentavos(d.saldoSistema)}</strong></div>
    <div><span>Saldo no banco</span><strong>${formatarCentavos(d.saldoBanco)}</strong></div>
    <div><span>Mensalidades pagas</span><strong>${d.mensalidades.pagas} de ${d.mensalidades.total - d.mensalidades.isentas}</strong></div>
  </div>

  <h2>Conferência com o extrato do banco</h2>
  ${
    d.divergencias.length
      ? `<div class="alerta"><strong>${d.divergencias.length} divergência(s) encontrada(s):</strong><ul>${d.divergencias
          .map((x) => `<li>${esc(textoDivergencia(x))}</li>`)
          .join('')}</ul></div>`
      : '<div class="ok">Saldo confere com o banco e todas as mensalidades baixadas têm crédito no extrato.</div>'
  }

  <h2>Despesas por categoria</h2>
  ${
    d.categorias.length
      ? `<table><tbody>${d.categorias
          .map((c) => `<tr><td>${esc(c.nome)}</td><td class="num">${formatarCentavos(c.total)}</td></tr>`)
          .join('')}</tbody></table>`
      : '<p class="nota">Nenhuma despesa no mês.</p>'
  }

  <h2>Extrato do mês</h2>
  ${
    d.linhas.length
      ? `<table><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Lançado por</th><th class="num">Valor</th><th class="num">Anexo</th></tr></thead><tbody>${linhas}</tbody></table>`
      : '<p class="nota">Nenhum lançamento no mês.</p>'
  }
  <p class="nota">Lançamentos não são editados nem apagados; correções aparecem como estorno. Comprovantes de mensalidade
  e o extrato bancário identificam quem pagou e ficam com o tesoureiro.</p>
</body></html>`;
}

async function renderizarHtml(html: string): Promise<Uint8Array> {
  // O Puppeteer é só ESM; o import dinâmico também evita carregar o Chrome na API.
  const { default: puppeteer } = await import('puppeteer');
  const navegador = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    // Dentro do contêiner o processo roda sem o sandbox do Chrome.
    args: process.env.PUPPETEER_SEM_SANDBOX === 'true' ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
  });
  try {
    const pagina = await navegador.newPage();
    await pagina.setContent(html, { waitUntil: 'load' });
    return await pagina.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:8pt;width:100%;text-align:center;color:#888">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
    });
  } finally {
    await navegador.close();
  }
}

/** Gera o PDF final: relatório + uma página (ou as páginas do PDF) por comprovante. */
/**
 * Ponto de troca para os testes: o Jest não carrega o Puppeteer (pacote só ESM), então lá
 * a renderização roda num processo Node separado, com o mesmo Chrome.
 */
export const motorPdf = { renderizar: renderizarHtml };

export async function gerarPdfPrestacao(dados: DadosRelatorio, anexos: Anexo[]): Promise<Buffer> {
  const documento = await PDFDocument.load(await motorPdf.renderizar(montarHtml(dados)));
  const fonte = await documento.embedFont(StandardFonts.Helvetica);
  const [largura, altura] = [595.28, 841.89];

  const cabecalho = (pagina: ReturnType<typeof documento.addPage>, texto: string) =>
    pagina.drawText(texto.replace(/[^\x20-\xFF]/g, '?').slice(0, 95), { x: 40, y: altura - 40, size: 11, font: fonte });

  for (const anexo of anexos) {
    const titulo = `Anexo ${anexo.numero} - ${anexo.titulo}`;
    if (anexo.contentType === 'application/pdf') {
      try {
        const origem = await PDFDocument.load(anexo.conteudo, { ignoreEncryption: true });
        const capa = documento.addPage([largura, altura]);
        cabecalho(capa, titulo);
        capa.drawText('Comprovante em PDF nas páginas seguintes.', { x: 40, y: altura - 60, size: 9, font: fonte });
        for (const pagina of await documento.copyPages(origem, origem.getPageIndices())) documento.addPage(pagina);
        continue;
      } catch {
        // PDF corrompido ou protegido: cai no aviso abaixo.
      }
    }
    const pagina = documento.addPage([largura, altura]);
    cabecalho(pagina, titulo);
    const imagem =
      anexo.contentType === 'image/jpeg'
        ? await documento.embedJpg(anexo.conteudo).catch(() => null)
        : anexo.contentType === 'image/png'
          ? await documento.embedPng(anexo.conteudo).catch(() => null)
          : null;
    if (!imagem) {
      pagina.drawText('Formato não incorporável ao PDF; o comprovante pode ser visto no app.', {
        x: 40,
        y: altura - 64,
        size: 9,
        font: fonte,
        color: rgb(0.4, 0.4, 0.4),
      });
      continue;
    }
    const caixa = { largura: largura - 80, altura: altura - 110 };
    const escala = Math.min(caixa.largura / imagem.width, caixa.altura / imagem.height, 1);
    const [w, h] = [imagem.width * escala, imagem.height * escala];
    pagina.drawImage(imagem, { x: (largura - w) / 2, y: altura - 60 - h, width: w, height: h });
  }

  return Buffer.from(await documento.save());
}
