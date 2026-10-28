// Faz o papel do Caddy no E2E: serve o build estático do PWA e repassa /api para a API.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { extname, join, normalize } from 'node:path';

const [porta, alvoApi, pasta] = process.argv.slice(2);
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const destino = new URL(req.url, alvoApi);
    const proxy = request(destino, { method: req.method, headers: req.headers }, (resposta) => {
      res.writeHead(resposta.statusCode, resposta.headers);
      resposta.pipe(res);
    });
    proxy.on('error', () => res.writeHead(502).end());
    return req.pipe(proxy);
  }
  const caminho = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let arquivo = join(pasta, caminho);
  if (!existsSync(arquivo) || statSync(arquivo).isDirectory()) arquivo = join(pasta, 'index.html');
  res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' });
  createReadStream(arquivo).pipe(res);
}).listen(Number(porta), () => console.log(`app em http://localhost:${porta}`));
