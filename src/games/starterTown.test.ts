import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blocked, TownWalker } from './starter-town/world';
test('walking takes one cardinal tile and interpolates before the next step', () => {
  const p = new TownWalker(); p.update(1 / 60, 1, 1);
  assert.equal(p.x, 12); assert.equal(p.y, 9); assert.equal(p.renderX, 11);
  p.update(0.07, 1, 0); assert.equal(p.renderX, 11.5);
  p.update(0.07, 1, 0); assert.equal(p.renderX, 12);
});
test('houses, water, signs, and town boundaries block walking', () => {
  for (const [x, y] of [[4, 3], [15, 4], [14, 11], [3, 12], [10, 8], [0, 0], [22, 9]]) assert.equal(blocked(x!, y!), true);
  const p = new TownWalker(); p.x = 9; p.y = 8; p.update(1 / 60, 1, 0);
  assert.equal(p.x, 9); assert.equal(p.steps, 0); assert.equal(p.direction, 'right');
});
