import test from 'node:test';
import assert from 'node:assert/strict';
import { PongSimulation } from './simple-pong/simulation';

test('ready state waits, player stays in bounds, and paddle returns the ball', () => {
  const g = new PongSimulation();
  g.step(1, 1); assert.equal(g.playerY, 280);
  g.start(); g.step(1, 1); assert.equal(g.playerY, 126);
  g.ball = { x: 85, y: 126, vx: -600, vy: 0 };
  g.step(1 / 30, 0);
  assert.ok(g.ball.vx > 0); assert.equal(g.hits, 1);
});

test('wall reflects ball and a seventh point ends the match', () => {
  const g = new PongSimulation(); g.start();
  g.ball = { x: 480, y: 88, vx: 340, vy: -200 };
  g.step(1 / 30, 0); assert.ok(g.ball.vy > 0);
  g.playerScore = 6;
  g.ball = { x: 969, y: 100, vx: 340, vy: 0 };
  g.step(1 / 30, 0);
  assert.equal(g.playerScore, 7); assert.equal(g.phase, 'won');
  g.step(1, 1); assert.equal(g.playerScore, 7);
});
