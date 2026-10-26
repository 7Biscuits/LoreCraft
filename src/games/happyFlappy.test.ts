import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FlappySimulation } from './happy-flappy/simulation';

test('waits for the first flap, then applies lift and gravity', () => {
  const s = new FlappySimulation();
  s.step(1); assert.equal(s.y, 270);
  s.flap(); s.step(1 / 60); assert.ok(s.y < 270); assert.ok(s.velocity < 0);
  for (let i = 0; i < 180; i++) s.step(1 / 60);
  assert.equal(s.phase, 'lost');
});
test('passing a pipe scores once; pipe edges cause a loss', () => {
  const s = new FlappySimulation(); s.flap(); s.velocity = 0;
  s.pipes = [{ x: 201, gap: 270, scored: false }];
  s.step(1 / 60); assert.equal(s.score, 1);
  s.step(1 / 60); assert.equal(s.score, 1);
  s.pipes = [{ x: 260, gap: 100, scored: false }];
  s.step(1 / 60); assert.equal(s.phase, 'lost');
  const y = s.y; s.flap(); s.step(1); assert.equal(s.y, y);
});
