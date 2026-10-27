import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gameCatalog } from './games/manifest.ts';
import { createStudioMiddleware } from './studio/api.ts';
import { generatorOptionsFromEnv } from './studio/generator.ts';
import type { GeneratorOptions } from './studio/generator.ts';
import { projectStore } from './projects/store.ts';

interface HostedOptions {
  root?: string;
  password: string;
  username?: string;
  generator?: GeneratorOptions;
}

/** Serves only compiled client files; private source, credentials and SQLite never enter the static root. */
export function createHostedServer(options: HostedOptions) {
  if (options.password.length < 16) throw new Error('Set LORECRAFT_STUDIO_PASSWORD to at least 16 characters.');
  const root = options.root ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const staticRoot = resolve(root, 'dist');
  const api = createStudioMiddleware(options.generator ?? {}, root, true);
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const expected = digest(`Basic ${Buffer.from(`${options.username ?? 'lorecraft'}:${options.password}`).toString('base64')}`);
  const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
  return createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    const json = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    const run = async () => {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (path === '/healthz' && req.method === 'GET') {
        projectStore(root).listMetadata();
        return json(200, { ok: true });
      }
      if (!timingSafeEqual(digest(req.headers.authorization ?? ''), expected)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="LoreCraft studio", charset="UTF-8"');
        return json(401, { error: 'Sign in to your LoreCraft studio.' });
      }
      if (path.startsWith('/api/')) {
        if (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)) return json(403, { error: 'Cross-origin requests are not allowed.' });
        if (path === '/api/games' || path === '/api/agent-status') {
          if (req.method !== 'GET') return json(405, { error: 'Use GET.' });
          return json(200, path === '/api/games' ? { games: gameCatalog.map(({ id, title }) => ({ id, title })), existingGameIds: gameCatalog.map((g) => g.id) } : { connected: false, activity: null });
        }
        return api(req, res, () => json(404, { error: 'Unknown API route.' }));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'Use GET or HEAD.' });
      const decoded = decodeURIComponent(path);
      const candidate = resolve(staticRoot, `.${decoded === '/' ? '/index.html' : decoded}`);
      if (!candidate.startsWith(staticRoot + sep) || decoded.split('/').some((part) => part.startsWith('.'))) return json(404, { error: 'Not found.' });
      let file: string;
      try { file = await realpath(candidate); }
      catch { return json(404, { error: 'Not found.' }); }
      const canonicalRoot = await realpath(staticRoot);
      if (!file.startsWith(canonicalRoot + sep)) return json(404, { error: 'Not found.' });
      const info = await stat(file);
      if (!info.isFile()) return json(404, { error: 'Not found.' });
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store' });
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(file);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    };
    void run().catch(() => { if (!res.headersSent) json(500, { error: 'The studio is temporarily unavailable.' }); else res.destroy(); });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const store = projectStore(); // Run migrations on the mounted disk at runtime, before readiness.
  const server = createHostedServer({ password: process.env.LORECRAFT_STUDIO_PASSWORD ?? '', username: process.env.LORECRAFT_STUDIO_USERNAME, generator: generatorOptionsFromEnv(process.env) });
  server.listen(port, '0.0.0.0', () => console.info(`LoreCraft listening on port ${port}.`));
  const shutdown = () => { server.close(() => { store.close(); process.exit(0); }); setTimeout(() => process.exit(1), 10000).unref(); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
