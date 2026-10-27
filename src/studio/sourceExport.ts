import { resolve } from 'node:path';
import { build, normalizePath } from 'vite';
import type { Connect, Plugin, ResolvedConfig } from 'vite';
import { readGameCatalog } from '../games/readManifest.ts';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Bundle only the selected game and browser host; no studio, bridge, or server credentials. */
export async function exportSourceHtml(root: string, gameId: string): Promise<{ html: string; filename: string }> {
  const game = readGameCatalog(root).find(g => g.id === gameId);
  if (!game) throw new Error('Unknown source game.');
  const entryId = normalizePath(resolve(root, '__lorecraft_standalone__.ts'));
  const gamePath = normalizePath(resolve(root, 'src/games', game.entry));
  const hostPath = normalizePath(resolve(root, 'src/games/host.ts'));
  const entry = `
    import { ${game.exportName} as game } from ${JSON.stringify(gamePath)};
    import { AuthoredGameHost } from ${JSON.stringify(hostPath)};
    const status = document.getElementById('status');
    const host = new AuthoredGameHost(game, error => { status.textContent = 'Game error: ' + String(error); }, {width:960,height:560});
    host.start().then(() => { status.textContent = 'Click the game to focus. Use the controls shown in the game.'; }).catch(error => { status.textContent = 'Could not start: ' + String(error); });
    document.getElementById('restart').onclick = () => { host.runtime.resetGame(); host.resume(); };
    document.getElementById('fullscreen').onclick = () => document.documentElement.requestFullscreen?.();
    window.addEventListener('pagehide', () => host.destroy());
  `;
  const result = await build({
    configFile: false, envFile: false, root, publicDir: false, logLevel: 'silent',
    plugins: [{ name: 'lorecraft-standalone', resolveId: id => id === entryId ? '\0' + entryId : undefined, load: id => id === '\0' + entryId ? entry : undefined }],
    build: { write: false, copyPublicDir: false, target: 'es2022', assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      lib: { entry: entryId, name: 'LoreCraftGame', formats: ['iife'] },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => 'output' in r ? r.output : []);
  const script = outputs.filter(o => o.type === 'chunk').map(o => o.code).join('\n').replace(/<\/script/gi, '<\\/script');
  if (!script) throw new Error('Game export did not produce a playable script.');
  // All current source games use procedural art/audio. Refuse incomplete files if a future game emits separate assets.
  if (outputs.some(o => o.type === 'asset')) throw new Error('This game uses assets that cannot yet be included in a single HTML file.');
  const title = escapeHtml(game.title);
  return { filename: `${game.id}.html`, html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · LoreCraft</title>
<style>*{box-sizing:border-box}body{margin:0;background:#0b1020;color:#e5eaf4;font:14px system-ui;overflow:hidden}#toolbar{position:fixed;z-index:10;top:0;left:0;right:0;height:52px;background:#111827ed;display:flex;align-items:center;gap:12px;padding:8px 16px}#status{flex:1;font-size:12px;color:#b7c5da;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}button{border:0;border-radius:6px;background:#d2c0ef;color:#20182d;padding:7px 12px;cursor:pointer}canvas{outline:none;top:calc(50% + 26px)!important;width:min(100vw,calc(171.428571dvh - 89.142857px))!important;height:auto!important}#toolbar strong{max-width:35vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style></head>
<body><div id="toolbar"><strong>${title}</strong><span id="status" role="status">Starting game…</span><button id="restart">Restart</button><button id="fullscreen">Fullscreen</button></div><script>${script}</script></body></html>` };
}

export function sourceExportApi(): Plugin {
  const configure = (server: { config: ResolvedConfig; middlewares: Connect.Server }) => {
    // Serialize builds so repeated clicks cannot run multiple bundlers at once.
    let busy = false;
    server.middlewares.use((req, res, next) => {
      const match = /^\/api\/games\/([a-z0-9-]+)\/export-html$/.exec(req.url?.split('?')[0] ?? '');
      if (!match) return next();
      const fail = (code: number, message: string) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: message })); };
      if (req.method !== 'GET') return fail(405, 'Use GET to download a game.');
      if (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)) return fail(403, 'Cross-origin requests are not allowed.');
      try { if (!readGameCatalog(server.config.root).some(g => g.id === match[1])) return fail(404, 'Source game not found.'); }
      catch { return fail(503, 'The game catalog is being updated. Try again shortly.'); }
      if (busy) return fail(409, 'Another game export is in progress. Try again shortly.');
      busy = true;
      void exportSourceHtml(server.config.root, match[1]!).then(({ html, filename }) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' }); res.end(html);
      }).catch(error => { server.config.logger.error(String(error)); fail(500, 'Could not export this game. Check the server logs and try again.'); }).finally(() => { busy = false; });
    });
  };
  return { name: 'lorecraft-source-export', configureServer: configure, configurePreviewServer: configure };
}
