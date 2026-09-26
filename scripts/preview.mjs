// Serves the exported web build (npx expo export --platform web) for previewing.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT || 8080);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json' };

http.createServer(async (req, res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(root, safe === '/' || safe === '' ? 'index.html' : safe);
    if (!filePath.startsWith(root)) { res.writeHead(403); res.end('Forbidden'); return; }
    const body = await readFile(filePath).catch(() => null);
    if (!body) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[extname(filePath)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'microphone=(), geolocation=()' });
    res.end(body);
  } catch {
    res.writeHead(500); res.end('Server error');
  }
}).listen(port, '0.0.0.0', () => console.log(`ProofPilot preview on http://0.0.0.0:${port}`));
