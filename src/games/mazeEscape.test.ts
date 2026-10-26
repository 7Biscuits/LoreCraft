import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { engineObjects, mainCanvasSize, setEngineManualStep, setHeadlessMode, vec2, worldToScreen } from 'littlejsengine';
import { AuthoredGameHost } from './host';
import { MazeEscapeGame } from './maze-escape';
import type { GameFrame } from './contract';
import type { CreateEntityArgs, EntityState } from '../runtime';

const game = new MazeEscapeGame();
const host = new AuthoredGameHost(game);
const runtime = host.runtime;
const frame: GameFrame = { deltaSeconds: 1 / 60, movement: { x: 0, y: 0 }, restart: false };

before(async () => {
  setHeadlessMode(true);
  setEngineManualStep(true);
  await host.start();
});
beforeEach(() => assert.equal(runtime.resetGame().ok, true));
after(() => {
  host.destroy();
  assert.deepEqual(runtime.listEntities(), { ok: true, data: [] });
  assert.equal(runtime.resetGame().ok, false);
});

function entity(id: string): EntityState {
  const result = runtime.getEntity(id);
  assert.ok(result.ok);
  return result.data;
}
function create(args: CreateEntityArgs) { assert.equal(runtime.createEntity(args).ok, true); }

test('rendering keeps the entire maze visible at embedded and full preview sizes', () => {
  const originalSize = mainCanvasSize.copy();
  try {
    for (const [width, height] of [[640, 376], [360, 210], [960, 560]]) {
      mainCanvasSize.set(width!, height!);
      game.render();
      for (const x of [-8, 8]) for (const y of [-8, 8]) {
        const screen = worldToScreen(vec2(x, y));
        assert.ok(screen.x >= 0 && screen.x < width!, 'Maze bounds must fit horizontally');
        assert.ok(screen.y >= 50 && screen.y < height! - 20, 'Maze bounds must fit between HUD and controls');
      }
    }
  } finally { mainCanvasSize.set(originalSize.x, originalSize.y); }
});

test('deleting the enemy leaves player movement, collecting, and winning operational', () => {
  runtime.deleteEntity('enemy-1');
  const before = entity('player-1').position.x;
  game.update({ ...frame, movement: { x: 1, y: 0 } });
  assert.ok(entity('player-1').position.x > before);
  runtime.setEntityPosition('player-1', { x: -5.5, y: 5.5 });
  game.update(frame);
  assert.equal(runtime.getEntity('key-1').ok, false);
  runtime.setEntityPosition('player-1', { x: 6.5, y: 6.5 });
  game.update(frame);
  const state = runtime.getGameState();
  assert.ok(state.ok);
  assert.equal(state.data.score, 1);
  assert.deepEqual(state.data.state, { hasKey: true, outcome: 'won' });
});

test('created obstacles block movement and moving or deleting them updates collisions immediately', () => {
  runtime.deleteEntity('enemy-1');
  create({ id: 'new-wall', type: 'obstacle', dimension: '2d', position: { x: -5.5, y: -6.5 } });
  const move: GameFrame = { ...frame, deltaSeconds: 1 / 30, movement: { x: 1, y: 0 } };
  game.update(move);
  assert.equal(entity('player-1').position.x, -6.5);
  runtime.setEntityPosition('new-wall', { x: 7, y: 7 });
  game.update(move);
  assert.ok(entity('player-1').position.x > -6.5);
  runtime.setEntityPosition('player-1', { x: -4, y: -4 });
  game.update(move);
  assert.equal(entity('player-1').position.x, -4); // The initial wall is also registry-backed.
  runtime.deleteEntity('wall-1');
  game.update(move);
  assert.ok(entity('player-1').position.x > -4);
});

test('enemy speed inspection and movement agree, including a speed of zero', () => {
  assert.equal(entity('enemy-1').properties.speed, 2.2);
  runtime.setEntityPosition('enemy-1', { x: 5, y: -6 });
  runtime.setEntityPosition('player-1', { x: 6.5, y: -6 });
  runtime.setEntityProperties('enemy-1', { speed: 0 });
  game.update(frame);
  assert.equal(entity('enemy-1').position.x, 5);
  runtime.setEntityProperties('enemy-1', { speed: 3 });
  game.update(frame);
  assert.ok(Math.abs(entity('enemy-1').position.x - 5.05) < 1e-8);
});

test('new coins and enemies participate in gameplay and expose the losing outcome', () => {
  runtime.deleteEntity('enemy-1');
  create({ id: 'extra-coin', type: 'coin', dimension: '2d', position: { x: -6.5, y: -6.5 } });
  game.update(frame);
  assert.equal(runtime.getEntity('extra-coin').ok, false);
  assert.deepEqual(game.getState(), { hasKey: true, outcome: 'playing' });
  create({ id: 'extra-enemy', type: 'enemy', dimension: '2d', position: { x: -6.5, y: -6.5 }, properties: { speed: 0 } });
  game.update(frame);
  assert.deepEqual(game.getState(), { hasKey: true, outcome: 'lost' });
  game.update({ ...frame, restart: true });
  assert.deepEqual(game.getState(), { hasKey: false, outcome: 'playing' });
  assert.equal(runtime.getEntity('extra-enemy').ok, false);
});

test('reset rebuilds the registry without leaving active orphaned LittleJS objects', () => {
  create({ id: 'temporary', type: 'obstacle', dimension: '2d', position: { x: 7, y: 7 } });
  for (let i = 0; i < 3; i++) assert.equal(runtime.resetGame().ok, true);
  const result = runtime.listEntities();
  assert.ok(result.ok);
  assert.equal(result.data.length, 7);
  assert.equal(engineObjects.filter((object) => !object.destroyed).length, 7);
  assert.equal(runtime.getEntity('temporary').ok, false);
});

test('high-speed movement cannot tunnel through initial walls', () => {
  runtime.deleteEntity('enemy-1');
  runtime.setEntityPosition('player-1', { x: -4, y: -4 });
  runtime.setEntityProperties('player-1', { speed: 120 });
  game.update({ ...frame, movement: { x: 1, y: 0 } });
  assert.equal(entity('player-1').position.x, -4);
});

test('deleting the controlling player enters a loss and restart recovers the scene', () => {
  runtime.deleteEntity('player-1'); game.update(frame);
  assert.equal(game.getState().outcome, 'lost');
  game.update({ ...frame, restart: true });
  assert.equal(game.getState().outcome, 'playing'); assert.equal(runtime.getEntity('player-1').ok, true);
});
