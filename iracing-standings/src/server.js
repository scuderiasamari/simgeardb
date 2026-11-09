import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSource } from './sources.js';
import { TtlCache } from './cache.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

export function createApp({ source, cache }) {
  const cached = (key, fn) => cache.wrap(key, fn);

  const routes = {
    '/api/status': async () => ({ mode: source.mode }),
    '/api/seasons': async () => cached('seasons', () => source.listSeasons()),
    '/api/standings': async (q) => {
      const seasonId = Number(q.get('season_id'));
      const carClassId = Number(q.get('car_class_id'));
      if (!Number.isInteger(seasonId) || !Number.isInteger(carClassId) || !seasonId || !carClassId) {
        throw Object.assign(new Error('season_id and car_class_id are required integers'), { status: 400 });
      }
      return cached(`standings:${seasonId}:${carClassId}`, () => source.getStandings(seasonId, carClassId));
    },
  };

  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

    const handler = routes[url.pathname];
    if (handler) {
      try {
        return send(res, 200, await handler(url.searchParams));
      } catch (err) {
        const status = err.status ?? 502;
        if (status >= 500) console.error(err);
        return send(res, status, { error: err.message });
      }
    }
    return serveStatic(url.pathname, res);
  };
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function serveStatic(pathname, res) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    send(res, 404, { error: 'Not found' });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const envFile = join(ROOT, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const source = createSource();
  const cache = new TtlCache(Number(process.env.CACHE_TTL_MINUTES ?? 10) * 60_000);
  const port = Number(process.env.PORT ?? 3000);
  createServer(createApp({ source, cache })).listen(port, () => {
    console.log(`iRacing standings (${source.mode} data) on http://localhost:${port}`);
  });
}
