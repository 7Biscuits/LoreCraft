import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { setEngineManualStep, setHeadlessMode } from 'littlejsengine';
import { AuthoredGameHost } from './host';
import { SuperMarioGame } from './super-mario';
import type { GameFrame } from './contract';
import type { CreateEntityArgs, EntityState } from '../runtime';

const game = new SuperMarioGame('super-mario', 'Super Mario Bros (World 1-1)');
const host = new AuthoredGameHost(game);
const runtime = host.runtime;
const frame: GameFrame = { deltaSeconds: 1 / 60, movement: { x: 0, y: 0 }, restart: false };

before(async () => {
  setHeadlessMode(true);
  setEngineManualStep(true);
  await host.start();
});

beforeEach(() => {
  assert.equal(runtime.resetGame().ok, true);
});

after(() => {
  host.destroy();
  assert.deepEqual(runtime.listEntities(), { ok: true, data: [] });
  assert.equal(runtime.resetGame().ok, false);
});

function entity(id: string): EntityState {
  const result = runtime.getEntity(id);
  assert.ok(result.ok, `Expected entity ${id} to exist`);
  return result.data;
}

function create(args: CreateEntityArgs) {
  assert.equal(runtime.createEntity(args).ok, true);
}

test('initializes with player, ground obstacles, coins, and enemies', () => {
  assert.equal(entity('player-1').type, 'player');
  assert.equal(entity('ground-1').type, 'obstacle');
  assert.equal(entity('coin-1').type, 'coin');
  assert.equal(entity('enemy-1').type, 'enemy');
  const state = runtime.getGameState();
  assert.ok(state.ok);
  assert.equal(state.data.mode, 'super-mario');
  assert.deepEqual(state.data.state, {
    outcome: 'playing',
    coins: 0,
    score: 0,
    timeLeft: 300,
    playerX: 2,
    playerY: 1.45,
    enemiesRemaining: 6,
    flagReached: false,
  });
});

test('player moves right when horizontal input is applied', () => {
  const startX = entity('player-1').position.x;
  for (let i = 0; i < 10; i++) {
    game.update({ ...frame, movement: { x: 1, y: 0 } });
  }
  assert.ok(entity('player-1').position.x > startX, 'Player should have moved right');
});

test('player jumps when vertical movement is applied', () => {
  const groundedY = entity('player-1').position.y;
  // Jump while on ground
  game.update({ ...frame, movement: { x: 0, y: 1 } });
  game.update({ ...frame, movement: { x: 0, y: 1 } });
  assert.ok(entity('player-1').position.y > groundedY, 'Player should have jumped upward');
});

test('collecting coins increments score and deletes the coin entity', () => {
  assert.ok(runtime.getEntity('coin-1').ok);
  // Teleport player directly onto coin-1 (x: 4, y: 4.8)
  runtime.setEntityPosition('player-1', { x: 4, y: 4.8 });
  game.update(frame);
  assert.equal(runtime.getEntity('coin-1').ok, false, 'Coin should be collected and deleted');
  const state = runtime.getGameState();
  assert.ok(state.ok);
  assert.equal(state.data.score, 100);
  assert.equal((state.data.state as { coins: number }).coins, 1);
});

test('stomping a goomba defeats the enemy and gives score', () => {
  assert.ok(runtime.getEntity('enemy-1').ok);
  // Position player falling directly on top of enemy-1 (x: 9.0, y: 1.4)
  runtime.setEntityPosition('player-1', { x: 9.0, y: 2.2 });
  // Update with player falling onto enemy
  for (let i = 0; i < 10; i++) {
    game.update(frame);
    if (!runtime.getEntity('enemy-1').ok) break;
  }
  assert.equal(runtime.getEntity('enemy-1').ok, false, 'Enemy should be stomped and deleted');
  const state = runtime.getGameState();
  assert.ok(state.ok);
  assert.equal(state.data.score, 200);
});

test('enemy speed updates dynamically through runtime entity properties', () => {
  assert.equal(entity('enemy-1').properties.speed, 1.6);
  // Stop enemy
  runtime.setEntityProperties('enemy-1', { speed: 0 });
  const posX = entity('enemy-1').position.x;
  for (let i = 0; i < 5; i++) game.update(frame);
  assert.equal(entity('enemy-1').position.x, posX, 'Stopped enemy should not move');

  // Accelerate enemy
  runtime.setEntityProperties('enemy-1', { speed: 4 });
  for (let i = 0; i < 5; i++) game.update(frame);
  assert.notEqual(entity('enemy-1').position.x, posX, 'Fast enemy should have moved');
});

test('hitting question block from below spawns coin and score', () => {
  // Move player on ground directly under qblock-1 (x: 4)
  runtime.setEntityPosition('player-1', { x: 4, y: 1.45 });
  // Settle on ground
  game.update(frame);
  // Jump upward into the block above (qblock-1 is at y: 3.5)
  for (let i = 0; i < 20; i++) {
    game.update({ ...frame, movement: { x: 0, y: 1 } });
    const s = runtime.getGameState();
    if (s.ok && s.data.score >= 100) break;
  }
  const state = runtime.getGameState();
  assert.ok(state.ok);
  assert.ok(state.data.score >= 100, 'Score should increase from question block coin');
});

test('reaching the flagpole triggers win outcome', () => {
  // Teleport player to the flagpole
  runtime.setEntityPosition('player-1', { x: 47.5, y: 3.0 });
  game.update(frame);
  const state = runtime.getGameState();
  assert.ok(state.ok);
  assert.equal((state.data.state as { outcome: string }).outcome, 'won');
  assert.equal((state.data.state as { flagReached: boolean }).flagReached, true);
});

test('falling into a pit triggers lost outcome', () => {
  runtime.setEntityPosition('player-1', { x: 15.3, y: -4.0 });
  game.update(frame);
  const state = runtime.getGameState();
  assert.ok(state.ok);
  assert.equal((state.data.state as { outcome: string }).outcome, 'lost');
});

test('deleting player enters lost state and restart recovers the scene', () => {
  runtime.deleteEntity('player-1');
  game.update(frame);
  const state = runtime.getGameState();
  assert.ok(state.ok);
  assert.equal((state.data.state as { outcome: string }).outcome, 'lost');

  // Restart
  game.update({ ...frame, restart: true });
  assert.ok(runtime.getEntity('player-1').ok);
  const afterReset = runtime.getGameState();
  assert.ok(afterReset.ok);
  assert.equal((afterReset.data.state as { outcome: string }).outcome, 'playing');
});

test('reset clears temporary entities and restores initial level', () => {
  create({ id: 'custom-coin', type: 'coin', dimension: '2d', position: { x: 10, y: 10 } });
  assert.ok(runtime.getEntity('custom-coin').ok);
  runtime.resetGame();
  assert.equal(runtime.getEntity('custom-coin').ok, false);
  assert.ok(runtime.getEntity('player-1').ok);
});

