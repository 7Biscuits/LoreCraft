import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, isFileServingAllowed } from 'vite';
import config from '../../vite.config';
import { agentStatusApi } from './agentApi';

test('Vite blocks credentials over direct and @fs routes and rejects cross-origin generation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lorecraft-security-'));
  const resolved = typeof config === 'function' ? await config({ command: 'serve', mode: 'test' }) : await config;
  mkdirSync(join(root, '.lorecraft')); writeFileSync(join(root, '.lorecraft/bridge-token'), 'fake-fixture-token');
  mkdirSync(join(root, '.agents')); writeFileSync(join(root, '.agents/mcp_config.json'), '{}');
  const server = await createServer({ ...resolved, configFile: false, root, server: { ...resolved.server, port: 0, watch: null } });
  try {
    assert.equal(isFileServingAllowed(join(root, '.lorecraft/bridge-token'), server), false);
    await server.listen(); const address = server.httpServer!.address(); assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    for (const route of ['/.lorecraft/bridge-token', '/.agents/mcp_config.json', `/@fs/${join(root, '.lorecraft/bridge-token')}`]) {
      const response = await fetch(base + route); assert.equal(response.status, 403); assert.ok(!(await response.text()).includes('fake-fixture-token'));
    }
    const denied = await fetch(`${base}/api/generate`, { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'forest adventure' }) });
    assert.equal(denied.status, 403);
    const status = await fetch(`${base}/api/status`); assert.equal(status.status, 200); assert.ok(!JSON.stringify(await status.json()).includes('apiKey'));
  } finally { await server.close(); rmSync(root, { recursive: true }); }
});


test('game library exposes fresh metadata without a relay and protects read-only routes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lorecraft-library-'));
  mkdirSync(join(root, 'src/games'), { recursive: true });
  const manifest = join(root, 'src/games/manifest.ts');
  const game = (id: string) => `{ id: '${id}', title: '${id}', entry: './${id}/index.ts', exportName: 'game' }`;
  writeFileSync(manifest, `export const gameCatalog = [${game('old-game')}];`);
  const plugin = agentStatusApi();
  const server = await createServer({ configFile: false, root, plugins: [plugin], server: { host: '127.0.0.1', port: 0, watch: null } });
  try {
    await server.listen(); const address = server.httpServer!.address(); assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const initial = await (await fetch(`${base}/api/games`)).json();
    assert.deepEqual(initial.existingGameIds, ['old-game']);
    assert.equal(initial.games[0].id, 'old-game');
    writeFileSync(manifest, `export const gameCatalog = [${game('old-game')}, ${game('new-game')}];`);
    const updated = await (await fetch(`${base}/api/games`)).json();
    assert.deepEqual(updated.games.map((g: { id: string }) => g.id), ['old-game', 'new-game']);
    assert.deepEqual(updated.existingGameIds, ['old-game']);
    assert.deepEqual(await (await fetch(`${base}/api/agent-status`)).json(), { connected: false, activity: null });
    for (const route of ['/api/games', '/api/agent-status']) {
      assert.equal((await fetch(base + route, { method: 'POST' })).status, 405);
      assert.equal((await fetch(base + route, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
    }
    // Edits to source games must not propagate a global full-page HMR reload.
    assert.equal(typeof plugin.handleHotUpdate, 'function');
    const hook = plugin.handleHotUpdate as (context: unknown) => unknown;
    assert.deepEqual(hook({ file: join(server.config.root, 'src/games/old-game/index.ts'), server }), []);
    assert.equal(hook({ file: join(server.config.root, 'src/studio/app.ts'), server }), undefined);
  } finally { await server.close(); rmSync(root, { recursive: true }); }
});
