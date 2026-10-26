import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { setHeadlessMode, setEngineManualStep } from 'littlejsengine';
import { AuthoredGameHost } from './host';
import { GeneratedGame } from '../studio/generatedGame';
import { compilePrompt } from '../studio/spec';
import { inspectionOperations } from '../runtime/inspection';
import { dispatchRuntimeOperation } from '../bridge/protocol';

const game = new GeneratedGame(compilePrompt('an easy forest adventure'));
const host = new AuthoredGameHost(game);
before(async () => { setHeadlessMode(true); setEngineManualStep(true); await host.start(); Object.assign(host.runtime, inspectionOperations(host)); });
beforeEach(() => { host.runtime.resetGame(); });
after(() => host.destroy());

test('generated gameplay reconciles live registry mutation and deletion', () => {
  host.runtime.setEntityPosition('player-1', { x: 3, y: 7 });
  host.runtime.setEntityProperties('player-1', { speed: 0 });
  host.runtime.deleteEntity('enemy-1');
  game.update({ deltaSeconds: 1 / 60, movement: { x: 1, y: 0 }, restart: false });
  assert.equal(game.engine.state.entities[0]!.x, 3);
  assert.equal(game.engine.state.entities.some((e) => e.id === 'enemy-1'), false);
  assert.equal(host.runtime.getEntity('enemy-1').ok, false);
});

test('inspection operations pause, step deterministically, simulate input, and validate frame bounds', () => {
  const operations = host.runtime;
  assert.equal(dispatchRuntimeOperation('pauseGame', {}, operations).ok, true);
  const tick = game.engine.state.tick;
  assert.equal(dispatchRuntimeOperation('stepGame', { frames: 12 }, operations).ok, true);
  assert.equal(game.engine.state.tick, tick + 12);
  const x = game.engine.state.entities[0]!.x;
  dispatchRuntimeOperation('simulateInput', { x: 1, y: 0, frames: 10 }, operations);
  assert.ok(game.engine.state.entities[0]!.x > x);
  assert.throws(() => dispatchRuntimeOperation('stepGame', { frames: 100000 }, operations), /1 to 600/);
  assert.throws(() => dispatchRuntimeOperation('simulateInput', { x: 99, y: 0, frames: 1 }, operations), /finite/);
});

test('checkpoint restore updates both portable simulation and live registry before further frames', () => {
  const saved = game.engine.snapshot();
  host.runtime.setEntityPosition('player-1', { x: 9, y: 9 });
  game.update({ deltaSeconds: 1 / 60, movement: { x: 0, y: 0 }, restart: false });
  assert.equal(game.engine.state.entities[0]!.x, 9);
  game.restore(saved);
  assert.deepEqual(game.engine.snapshot(), saved);
  const player = host.runtime.getEntity('player-1'); assert.ok(player.ok); assert.equal(player.data.position.x, saved.entities[0]!.x);
});
