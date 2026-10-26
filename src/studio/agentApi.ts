import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ResolvedConfig, Connect } from 'vite';
import { resolve, sep } from 'node:path';
import { readGameCatalog } from '../games/readManifest.ts';
import { readBridgeToken } from '../bridge/access.ts';

/** Read-only status relay; browser requests never contain the access token. */
export function agentStatusApi(): Plugin {
  let initialGameIds: string[] | undefined;
  const configure = (server: { config: ResolvedConfig; middlewares: Connect.Server }) => {
    try { initialGameIds ??= readGameCatalog(server.config.root).map((g) => g.id); } catch { /* Retry after metadata is repaired. */ }
    server.middlewares.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
      const path = request.url?.split('?')[0];
      if (path !== '/api/agent-status' && path !== '/api/games') return next();
      const reply = (code: number, data: unknown) => { response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); };
      if (request.method !== 'GET') return reply(405, { error: 'Read-only status endpoint.' });
      if (request.headers.origin && ![`http://${request.headers.host}`, `https://${request.headers.host}`].includes(request.headers.origin)) return reply(403, { error: 'Cross-origin requests are not allowed.' });
      if (path === '/api/games') {
        try { return reply(200, { games: readGameCatalog(server.config.root).map(({ id, title }) => ({ id, title })), existingGameIds: initialGameIds ?? [] }); }
        catch { return reply(503, { error: 'Game catalog is being updated.' }); }
      }
      void (async () => {
        try {
          const proxy = server.config.server.proxy?.['/runtime-bridge'];
          const target = typeof proxy === 'string' ? proxy : proxy?.target;
          if (typeof target !== 'string') throw new Error('No relay.');
          const url = new URL(target); url.protocol = 'http:'; url.pathname = '/agent-status';
          if (url.hostname !== '127.0.0.1') throw new Error('Expected loopback relay.');
          const authorization = typeof proxy === 'object' ? proxy.headers?.Authorization : undefined;
          const result = await fetch(url, { headers: { Authorization: typeof authorization === 'string' ? authorization : `Bearer ${readBridgeToken()}` }, signal: AbortSignal.timeout(800) });
          if (!result.ok) throw new Error('Relay unavailable.');
          reply(200, await result.json());
        } catch { reply(200, { connected: false, activity: null }); }
      })();
    });
  };
  return {
    name: 'lorecraft-agent-status', configureServer: configure, configurePreviewServer: configure,
    // Source games are loaded in isolated documents. The agent publishes a fresh
    // runtime after validation; editing them must not reload the whole studio.
    hotUpdate: {
      // Run after Vite's glob hook has discovered added/deleted game modules.
      order: 'post',
      handler(context) {
        if (!context.file.startsWith(resolve(context.server.config.root, 'src/games') + sep)) return;
        // Fresh documents must see the updated glob without reloading existing ones.
        for (const module of context.modules) this.environment.moduleGraph.invalidateModule(module);
        return [];
      },
    },
  };
}
