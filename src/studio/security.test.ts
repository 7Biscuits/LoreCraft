import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, isFileServingAllowed } from 'vite';
import type { Plugin } from 'vite';
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
    assert.equal(typeof plugin.hotUpdate, 'object');
  } finally { await server.close(); rmSync(root, { recursive: true }); }
});

test('game additions, edits and deletions refresh modules without broadcasting page reloads', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lorecraft-game-hmr-')));
  mkdirSync(join(root, 'src/games/old-game'), { recursive: true });
  writeFileSync(join(root, 'src/main.ts'), "import './catalog.ts';");
  writeFileSync(join(root, 'src/catalog.ts'), "export const games = import.meta.glob('./games/*/index.ts');");
  const oldGame = join(root, 'src/games/old-game/index.ts');
  writeFileSync(oldGame, 'export const game = 1;');
  let updated: (() => void) | undefined;
  const probe: Plugin = { name: 'observe-game-hmr', hotUpdate: { order: 'post', handler() { if (this.environment.name === 'client') updated?.(); } } };
  const server = await createServer({ configFile: false, root, plugins: [agentStatusApi(), probe], logLevel: 'silent', server: { host: '127.0.0.1', port: 0, watch: null } });
  const messages: unknown[] = [];
  server.environments.client!.hot.send = ((message: unknown) => { messages.push(message); }) as typeof server.environments.client.hot.send;
  const update = async (type: 'add' | 'change' | 'unlink', file: string) => {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Vite did not process the game update.')), 2000);
      updated = () => { clearTimeout(timer); resolve(); };
      server.watcher.emit(type, file);
    });
    // Vite sends HMR messages after all hooks complete.
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(messages, [], `${type} must not interrupt active documents`);
  };
  try {
    await server.listen();
    await server.transformRequest('/src/main.ts');
    await server.transformRequest('/src/catalog.ts');
    await server.transformRequest('/src/games/old-game/index.ts');
    const newGame = join(root, 'src/games/new-game/index.ts');
    mkdirSync(join(root, 'src/games/new-game'));
    writeFileSync(newGame, 'export const game = 2;');
    await update('add', newGame);
    assert.match((await server.transformRequest('/src/catalog.ts'))!.code, /new-game/);
    writeFileSync(oldGame, 'export const game = 3;');
    await update('change', oldGame);
    assert.match((await server.transformRequest('/src/games/old-game/index.ts'))!.code, /game = 3/);
    rmSync(newGame);
    await update('unlink', newGame);
    assert.doesNotMatch((await server.transformRequest('/src/catalog.ts'))!.code, /new-game/);
    // Changes outside source games retain Vite's normal reload behavior.
    await new Promise<void>((resolve) => {
      updated = resolve;
      server.watcher.emit('change', join(root, 'src/main.ts'));
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(messages.some((message) => (message as { type: string }).type === 'full-reload'));
  } finally { await server.close(); rmSync(root, { recursive: true }); }
});
