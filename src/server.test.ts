import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';
import { createHostedServer } from './server';
import { ProjectStore, projectStore } from './projects/store';

const listen = async (server: Server) => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
};
const close = (server: Server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

test('hosted studio protects private projects, serves only dist, and retains SQLite revisions after restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lorecraft-hosted-'));
  mkdirSync(join(root, 'dist/assets'), { recursive: true });
  writeFileSync(join(root, 'dist/index.html'), '<!doctype html><title>LoreCraft</title>');
  writeFileSync(join(root, 'dist/assets/game.js'), 'console.info("game");');
  writeFileSync(join(root, '.env'), 'PRIVATE_FIXTURE=not-for-http');
  symlinkSync(join(root, '.env'), join(root, 'dist/secret.txt'));
  const password = 'fixture-password-for-tests';
  const headers = { Authorization: `Basic ${Buffer.from(`lorecraft:${password}`).toString('base64')}` };
  let server = createHostedServer({ root, password });
  let base = await listen(server);
  try {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    for (const path of ['/', '/api/projects', '/api/games', '/api/status']) {
      const response = await fetch(base + path); assert.equal(response.status, 401);
      assert.match(response.headers.get('www-authenticate')!, /Basic/);
    }
    assert.equal((await fetch(`${base}/`, { headers })).status, 200);
    const script = await fetch(`${base}/assets/game.js`, { headers });
    assert.equal(script.status, 200); assert.match(script.headers.get('content-type')!, /javascript/);
    for (const path of ['/.env', '/src/server.ts', '/secret.txt', '/%2eenv', '/.lorecraft/projects.sqlite', '/assets/%2e%2e/%2eenv', '/runtime-bridge']) assert.equal((await fetch(base + path, { headers })).status, 404, path);
    const status = await (await fetch(`${base}/api/status`, { headers })).json();
    assert.equal(status.serverPersistence, true); assert.equal(status.aiAvailable, false);
    assert.equal((await fetch(`${base}/api/games`, { headers })).status, 200);
    const post = (body: unknown, origin = base) => fetch(`${base}/api/projects`, { method: 'POST', headers: { ...headers, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ prompt: 'a forest puzzle' }, 'https://other.example')).status, 403);
    const created = await post({ prompt: 'a peaceful forest puzzle' }); assert.equal(created.status, 200);
    const original = await created.json();
    const edited = await post({ projectId: original.project.id, expectedRevision: original.project.activeRevisionId, prompt: 'Use six lives', patch: { lives: 6 } });
    assert.equal(edited.status, 200);
    await close(server);
    const disk = new ProjectStore(join(root, '.lorecraft/projects.sqlite'));
    try { assert.equal(disk.get(original.project.id).revisions.length, 2); } finally { disk.close(); }
    server = createHostedServer({ root, password }); base = await listen(server);
    const restored = await (await fetch(`${base}/api/projects/${original.project.id}`, { headers })).json();
    assert.equal(restored.project.revisions.length, 2);
    assert.equal(restored.project.revisions.at(-1).spec.lives, 6);
  } finally { await close(server); projectStore(root).close(); rmSync(root, { recursive: true }); }
});
