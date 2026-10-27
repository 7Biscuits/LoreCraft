import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';
import { createServer } from 'vite';
import { exportSourceHtml, sourceExportApi } from './sourceExport';

test('source games export as single-file scripts without bridge or module requests', async () => {
  for (const id of ['simple-pong', 'physics-frontier', 'sword-duel']) {
    const { html, filename } = await exportSourceHtml(process.cwd(), id);
    assert.equal(filename, `${id}.html`);
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(html.includes('id="restart"'));
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    new Script(scripts[0]![1]!); // A normal script parses and runs from file://; no module loader is needed.
    assert.ok(scripts[0]![1]!.includes(id));
    assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|\/runtime-bridge|Bearer |OPENAI_API_KEY/);
  }
});

test('export API downloads only registered games and rejects cross-origin requests', async () => {
  const server = await createServer({ configFile: false, plugins: [sourceExportApi()], server: { host: '127.0.0.1', port: 0 } });
  try {
    await server.listen();
    const address = server.httpServer!.address(); assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const missing = await fetch(`${base}/api/games/missing/export-html`); assert.equal(missing.status, 404);
    const denied = await fetch(`${base}/api/games/simple-pong/export-html`, { headers: { Origin: 'https://other.example' } }); assert.equal(denied.status, 403);
    const method = await fetch(`${base}/api/games/simple-pong/export-html`, { method: 'POST' }); assert.equal(method.status, 405);
    const result = await fetch(`${base}/api/games/simple-pong/export-html`);
    assert.equal(result.status, 200); assert.match(result.headers.get('content-disposition')!, /simple-pong\.html/);
    assert.match(result.headers.get('content-type')!, /text\/html/);
    assert.match(await result.text(), /Simple Pong/);
  } finally { await server.close(); }
});
