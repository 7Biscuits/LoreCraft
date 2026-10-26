import assert from 'node:assert/strict';
import test from 'node:test';
import { validateGameModule } from './contract';
import { mazeEscapeGame } from './maze-escape';

const validModule = {
  id: 'test-game',
  title: 'Test Game',
  init: () => {},
  update: () => {},
  render: () => {},
  reset: () => {},
  destroy: () => {},
};

test('accepts the minimal authored game contract', () => {
  assert.deepEqual(validateGameModule(validModule), { ok: true, errors: [] });
});

test('reports missing lifecycle hooks and invalid IDs clearly', () => {
  const result = validateGameModule({ ...validModule, id: 'Invalid Game', update: undefined });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /lowercase/);
  assert.match(result.errors.join(' '), /update/);
});

test('the Maze Escape example is a valid authored game module', () => {
  assert.deepEqual(validateGameModule(mazeEscapeGame), { ok: true, errors: [] });
});
