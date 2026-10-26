import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePrompt, gameSpecSchema } from './spec';
import { createGameEngine } from './engine';
import { playtest } from './playtest';
import { foundations } from './foundations';
import { assetLibrary } from './assets';

test('every reusable foundation produces validated, deterministic playable levels in each theme', () => {
  for (const genre of Object.keys(foundations)) for (const theme of Object.keys(assetLibrary.palettes)) {
    const spec = compilePrompt(`An easy ${theme} ${genre} game without enemies`);
    assert.equal(spec.genre, genre); assert.equal(spec.theme, theme);
    const checks = playtest(spec); assert.deepEqual(checks.filter((c) => !c.passed), [], `${genre}/${theme}`);
    assert.deepEqual(createGameEngine(spec).snapshot(), createGameEngine(spec).snapshot());
  }
});

test('platformer jumps, falls and lands on reusable platform collisions', () => {
  const spec = compilePrompt('forest platformer without enemies'), e = createGameEngine(spec), p = e.state.entities[0]!;
  for (let i = 0; i < 20; i++) e.step();
  const ground = p.y;
  e.step({ x: 0, y: -1 }); assert.ok(p.vy < 0); assert.ok(p.y < ground);
  for (let i = 0; i < 120; i++) e.step();
  assert.ok(Math.abs(p.y - ground) < .01); assert.equal(p.vy, 0);
  const custom = gameSpecSchema.parse({ ...spec, level: { platforms: [{ x: 8, y: 9, w: 2, h: .4 }] } });
  assert.ok(createGameEngine(custom).state.entities.some((e) => e.id === 'platform-0' && e.x === 8));
  assert.equal(gameSpecSchema.safeParse({ ...spec, level: { platforms: [{ x: 200, y: 9, w: 2, h: .4 }] } }).success, false);
});

test('puzzle tokens must be collected in order and inputs advance on a grid', () => {
  const e = createGameEngine(compilePrompt('forest puzzle')), p = e.state.entities[0]!;
  const first = e.state.entities.find((e) => e.id === 'gem-1')!, second = e.state.entities.find((e) => e.id === 'gem-2')!;
  p.x = second.x; p.y = second.y; e.step(); assert.equal(e.state.collected, 0);
  p.x = first.x; p.y = first.y; e.step(); assert.equal(e.state.collected, 1);
  p.x = second.x; p.y = second.y; e.step(); assert.equal(e.state.collected, 2);
  const x = p.x; e.step({ x: 1, y: 0 }); assert.equal(p.x - x, .5);
  e.step({ x: 1, y: 0 }); assert.equal(p.x - x, .5);
});
