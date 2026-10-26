import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, isFileServingAllowed } from 'vite';
import config from '../../vite.config';

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
