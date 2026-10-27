import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsWorld, terrain } from './physics-frontier/simulation';

test('free fall follows gravity and lighter gravity gives a higher jump', () => {
  const earth = new PhysicsWorld(); earth.bodies.splice(1);
  const moon = new PhysicsWorld(); moon.bodies.splice(1); moon.gravity = 1.62;
  for (const w of [earth, moon]) { w.player.y = 2000; w.player.grounded = false; for (let i = 0; i < 60; i++) w.step(1 / 60, { move: 0 }); }
  assert.ok(Math.abs(earth.player.vy + 490.5) < 12);
  assert.ok(moon.player.y > earth.player.y + 180);
});
test('two-body collision conserves horizontal momentum apart from air drag', () => {
  const w = new PhysicsWorld(); w.gravity = 0; w.bodies.splice(2);
  const a = w.player, b = w.bodies[1]!;
  Object.assign(a, { x: 500, y: 1000, vx: 120, vy: 0, grounded: false });
  Object.assign(b, { x: 540, y: 1000, vx: -50, vy: 0 });
  const before = a.mass * a.vx + b.mass * b.vx;
  w.step(1 / 120, { move: 0 });
  assert.ok(Math.abs(a.mass * a.vx + b.mass * b.vx - before) < 0.2);
  assert.ok(b.vx > -50);
});
test('recoil throw conserves momentum and releases held body', () => {
  const w = new PhysicsWorld(); w.gravity = 0; w.bodies.splice(2);
  const p = w.player, b = w.bodies[1]!;
  Object.assign(p, { x: 500, y: 1000, vx: 0, vy: 0 });
  Object.assign(b, { x: 570, y: 1040, vx: 0, vy: 0 });
  w.held = b.id; w.step(0, { move: 0, throw: true });
  assert.equal(w.held, -1); assert.ok(b.vx > 0 && p.vx < 0);
  assert.ok(Math.abs(p.mass * p.vx + b.mass * b.vx) < 1e-9);
});
test('ground contact and long exploration stay finite and discover landmarks', () => {
  const w = new PhysicsWorld();
  for (let i = 0; i < 1800; i++) w.step(1 / 60, { move: 1, jump: i % 90 === 0 });
  assert.ok(w.visited.size >= 2);
  assert.ok(w.player.y >= terrain(w.player.x) - 10);
  assert.ok(w.bodies.every(b => [b.x, b.y, b.vx, b.vy].every(Number.isFinite)));
});
