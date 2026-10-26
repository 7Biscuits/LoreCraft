import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { clearSelection, deleteSourceGame, readProjects, readSelection, readSourceGames, saveSelection, saveSourceGame } from './storage';
import type { SavedSourceGame } from './storage';

function memoryStorage(t: TestContext) {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  return values;
}

const game: SavedSourceGame = { id: 'super-mario', title: 'Super Mario', prompt: 'A Mario platformer', createdAt: new Date().toISOString(), origin: 'local', jobId: 'local-first' };

test('saved source games deduplicate and deleted or superseded agent jobs stay dismissed', (t) => {
  memoryStorage(t);
  assert.equal(saveSourceGame({ ...game, origin: 'agent', jobId: 'agent-first' }), true);
  assert.equal(saveSourceGame(game), true);
  assert.equal(saveSourceGame({ ...game, origin: 'agent', jobId: 'agent-first' }), false);
  assert.equal(readSourceGames().length, 1);
  assert.equal(readSourceGames()[0]?.jobId, game.jobId);
  deleteSourceGame(game.id);
  assert.deepEqual(readSourceGames(), []);
  assert.equal(saveSourceGame(game), false);
  assert.equal(saveSourceGame({ ...game, origin: 'agent', jobId: 'agent-first' }), false);
  assert.equal(saveSourceGame({ ...game, jobId: 'local-new-prompt' }), true);
  assert.equal(readSourceGames()[0]?.jobId, 'local-new-prompt');
  assert.deepEqual(readProjects(), [], 'Source library operations must not create or change project JSON');
});

test('selection and source metadata validate storage and preserve a bounded library', (t) => {
  const storage = memoryStorage(t);
  assert.throws(() => saveSourceGame({ ...game, id: '../escape' }));
  assert.throws(() => saveSourceGame({ ...game, title: '' }));
  for (let i = 0; i < 35; i++) saveSourceGame({ ...game, id: `game-${i}`, jobId: `job-${i}` });
  assert.equal(readSourceGames().length, 30);
  assert.equal(readSourceGames()[0]?.id, 'game-34');
  saveSelection('source', 'game-34');
  assert.deepEqual(readSelection(), { kind: 'source', id: 'game-34' });
  clearSelection(); assert.equal(readSelection(), undefined);
  storage.set('lorecraft.selection.v1', '{invalid'); assert.equal(readSelection(), undefined);
  storage.set('lorecraft.source-games.v1', JSON.stringify({ games: [{ ...game, id: '../escape' }], dismissedJobs: [] }));
  assert.throws(() => readSourceGames());
});
