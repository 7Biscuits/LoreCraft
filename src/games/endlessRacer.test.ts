import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RacingSimulation } from './endless-racer/simulation';

test('waits for start, steering stays on the road, and brakes reduce speed', () => {
  const s = new RacingSimulation(); s.step(1, 1); assert.equal(s.distance, 0);
  s.start();
  for (let i = 0; i < 60; i++) s.step(1 / 60, 1);
  assert.equal(s.x, 619); assert.ok(s.distance > 0);
  const speed = s.speed; s.step(1 / 60, 0, true); assert.ok(s.speed < speed);
});
test('collision ends a run and freezes distance', () => {
  const s = new RacingSimulation(); s.start(); s.traffic = [{ x: 480, y: 450, color: 0 }];
  s.step(1 / 60, 0); assert.equal(s.phase, 'crashed');
  const distance = s.distance; s.step(1, 0); assert.equal(s.distance, distance);
});
test('traffic waves leave an open lane and passing counts once', () => {
  const s = new RacingSimulation(); s.start();
  s.traffic = [{ x: 370, y: 544, color: 0 }];
  s.step(1 / 60, 0); assert.equal(s.passed, 1);
  s.step(1 / 60, 0); assert.equal(s.passed, 1);
  for (let i = 0; i < 60; i++) s.step(1 / 60, 0);
  assert.ok(s.traffic.length > 0); assert.ok(s.traffic.filter(car => car.y < 100).length <= 2);
});
