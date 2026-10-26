import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { ProjectStore, ProjectConflict } from './store';
import { createProjectGame } from './creation';
import { compilePrompt } from '../studio/spec';

test('projects and AI context survive reopening, and patches retain seed and unspecified fields', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lorecraft-context-')), path = join(root, 'projects.sqlite');
  let store = new ProjectStore(path);
  try {
    const created = await createProjectGame({ prompt: 'a peaceful forest puzzle', instructions: 'Keep the forest setting.' }, store);
    const seed = created.spec.seed, id = created.project.id;
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.get(id).context, created.project.context);
    const edited = await createProjectGame({ prompt: 'Use five lives', projectId: id, patch: { lives: 5 }, expectedRevision: created.project.activeRevisionId }, store);
    assert.equal(edited.spec.seed, seed); assert.equal(edited.spec.theme, 'forest'); assert.equal(edited.spec.lives, 5);
    assert.equal(edited.project.revisions.length, 2);
    assert.equal(edited.project.context?.instructions, 'Keep the forest setting.');
    assert.equal(edited.diagnostics.productionBuild, false);
    await assert.rejects(createProjectGame({ prompt: 'Use six lives', projectId: id, expectedRevision: created.project.activeRevisionId, patch: { lives: 6 } }, store), ProjectConflict);
    assert.equal(store.get(id).revisions.length, 2);
    const before = store.list().length;
    await assert.rejects(createProjectGame({ prompt: 'bad game', spec: { ...compilePrompt('forest adventure'), lives: 999 } }, store));
    assert.equal(store.list().length, before);
  } finally { store.close(); rmSync(root, { recursive: true }); }
});

test('v1 database migration adds context without losing projects or revisions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lorecraft-migration-')), path = join(root, 'projects.sqlite');
  const db = new DatabaseSync(path);
  db.exec(readFileSync(new URL('./migrations/001_projects.sql', import.meta.url), 'utf8'));
  db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY); INSERT INTO schema_migrations VALUES (1);');
  const spec = compilePrompt('forest adventure'), revision = { id: crypto.randomUUID(), spec, prompt: 'forest adventure', createdAt: new Date().toISOString(), source: 'local', checks: [] };
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO projects VALUES (?,?,?,?)').run(id, revision.createdAt, revision.createdAt, revision.id);
  db.prepare('INSERT INTO project_revisions VALUES (?,?,?)').run(revision.id, id, JSON.stringify(revision)); db.close();
  const store = new ProjectStore(path);
  try { assert.equal(store.get(id).revisions[0]?.spec.title, spec.title); assert.equal(store.get(id).context, undefined); }
  finally { store.close(); rmSync(root, { recursive: true }); }
});

test('AI refinement receives persisted context and invalid output does not overwrite it', async () => {
  const store = new ProjectStore(':memory:');
  try {
    const created = await createProjectGame({ prompt: 'a space shooter', instructions: 'Keep it accessible.' }, store);
    const result = await createProjectGame({ prompt: 'Make it easier', projectId: created.project.id, mode: 'ai' }, store, {
      apiKey: 'fixture-key', fetch: (async (_url, init) => {
        const input = JSON.parse(JSON.parse(String(init?.body)).input);
        assert.equal(input.context.instructions, 'Keep it accessible.');
        assert.ok(input.context.turns.some((t: { content: string }) => t.content === 'a space shooter'));
        return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ ...created.spec, difficulty: 'easy' }) }] }] }));
      }) as typeof fetch,
    });
    assert.equal(result.spec.difficulty, 'easy'); assert.equal(result.project.id, created.project.id);
    assert.equal(result.project.revisions.length, 2);
    const signal = AbortSignal.abort();
    await assert.rejects(createProjectGame({ prompt: 'Change lives', projectId: created.project.id, patch: { lives: 4 } }, store, { signal }));
    assert.equal(store.get(created.project.id).revisions.length, 2);
  } finally { store.close(); }
});
