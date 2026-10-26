import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { studioApi } from '../studio/api';
import { projectStore } from './store';

test('project HTTP routes persist revisions, reject invalid requests and protect cross-origin writes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lorecraft-project-api-'));
  const server = await createServer({ root, configFile: false, plugins: [studioApi({})], server: { host: '127.0.0.1', port: 0, watch: null } });
  try {
    await server.listen(); const address = server.httpServer!.address(); assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const post = (body: unknown, origin?: string) => fetch(`${base}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
    assert.equal((await post({ prompt: 'a forest puzzle' }, 'https://untrusted.example')).status, 403);
    assert.equal((await post({ prompt: 'a puzzle', patch: { lives: -4 } })).status, 400);
    const response = await post({ prompt: 'a forest platformer without enemies', instructions: 'No combat.' });
    assert.equal(response.status, 200); const created = await response.json();
    assert.equal(created.foundation.id, 'gravity-platformer');
    const id = created.project.id;
    const edit = await post({ projectId: id, prompt: 'Change lives', expectedRevision: created.project.activeRevisionId, patch: { lives: 6 } });
    assert.equal(edit.status, 200);
    assert.equal((await post({ projectId: id, prompt: 'Stale change', expectedRevision: created.project.activeRevisionId, patch: { lives: 7 } })).status, 409);
    const project = (await (await fetch(`${base}/api/projects/${id}`)).json()).project;
    assert.equal(project.revisions.length, 2); assert.equal(project.context.instructions, 'No combat.');
    assert.equal((await (await fetch(`${base}/api/projects`)).json()).projects.length, 1);
    assert.equal((await fetch(`${base}/api/projects/${crypto.randomUUID()}`)).status, 404);
  } finally { await server.close(); projectStore(root).close(); rmSync(root, { recursive: true }); }
});
