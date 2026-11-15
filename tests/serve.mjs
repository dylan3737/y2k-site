// A tiny static server that mirrors GitHub Pages: the repo is served under /y2k-site/.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = '/y2k-site/';
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};

export function serve(port = 0) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!path.startsWith(BASE)) {
      res.writeHead(302, { Location: BASE });
      return res.end();
    }
    let file = normalize(join(ROOT, path.slice(BASE.length)));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end();
    }
    if (path.endsWith('/')) file = join(file, 'index.html');
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(await readFile(join(ROOT, '404.html')));
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await serve(Number(process.env.PORT) || 8080);
  console.log(`Serving at http://127.0.0.1:${server.address().port}${BASE}`);
}
