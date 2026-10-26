import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import * as z from 'zod/v4';
import { createProjectGame } from '../projects/creation.ts';
import { projectStore, ProjectConflict, ProjectNotFound } from '../projects/store.ts';
import { foundations } from './foundations.ts';
import { generateGame } from './generator.ts';
import type { GeneratorOptions } from './generator.ts';
export { generateGame, generatorOptionsFromEnv } from './generator.ts';
export type { GeneratorOptions } from './generator.ts';

export function studioApi(options: GeneratorOptions): Plugin {
  let root = process.cwd();
  const clients = new Map<string, { count: number; reset: number }>();
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/')) return next();
    const json = (code: number, data: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    const path = req.url.split('?')[0];
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return json(403, { error: 'Cross-origin requests are not allowed.' });
    if (path === '/api/status' && req.method === 'GET') return json(200, { aiAvailable: Boolean(options.apiKey), model: options.model ?? 'gpt-4.1-mini' });
    if (path === '/api/foundations' && req.method === 'GET') return json(200, { foundations });
    if (path === '/api/projects' && req.method === 'GET') {
      try { return json(200, { projects: projectStore(root).listMetadata() }); }
      catch { return json(500, { error: 'Project library is unavailable.' }); }
    }
    const projectId = path?.match(/^\/api\/projects\/([a-f0-9-]{36})$/)?.[1];
    if (projectId && req.method === 'GET') {
      try { return json(200, { project: projectStore(root).get(projectId) }); }
      catch (error) { return json(error instanceof ProjectNotFound ? 404 : 500, { error: error instanceof ProjectNotFound ? error.message : 'Could not load project.' }); }
    }
    if (path !== '/api/generate' && path !== '/api/projects') return json(404, { error: 'Unknown API route.' });
    if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Expected application/json.' });
    const ip = req.socket.remoteAddress ?? 'local', now = Date.now();
    if (clients.size > 1000) for (const [key, entry] of clients) if (entry.reset < now) clients.delete(key);
    const entry = clients.get(ip); const rate = entry && entry.reset > now ? entry : { count: 0, reset: now + 60000 }; clients.set(ip, rate);
    if (++rate.count > 12) return json(429, { error: 'Generation limit reached. Please wait one minute.' });
    const chunks: Buffer[] = []; let length = 0;
    try {
      for await (const chunk of req) { length += Buffer.byteLength(chunk); if (length > 64000) return json(413, { error: 'Request is too large.' }); chunks.push(Buffer.from(chunk)); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const result = path === '/api/projects' ? await createProjectGame(body, projectStore(root), options) : await generateGame(body, options); json(200, result);
    } catch (error) { json(error instanceof ProjectConflict ? 409 : error instanceof ProjectNotFound ? 404 : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 502, { error: error instanceof z.ZodError ? 'Invalid game request. Prompt must be 3–4,000 characters and project data must match the schema.' : error instanceof Error ? error.message : 'Generation failed.' }); }
  };
  return { name: 'lorecraft-studio-api', configureServer(server) { root = server.config.root; server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); }, configurePreviewServer(server) { root = server.config.root; server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); } };
}
