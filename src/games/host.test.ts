import assert from 'node:assert/strict';
import test from 'node:test';
import { engineStep, setHeadlessMode, setEngineManualStep } from 'littlejsengine';
import { AuthoredGameHost } from './host';

test('a gameplay update failure reports its cause and disposes the game once', async () => {
  setHeadlessMode(true);
  setEngineManualStep(true);
  let updates = 0;
  let destroyed = 0;
  let failure: unknown;
  const host = new AuthoredGameHost({
    id: 'broken-game', title: 'Broken Game',
    init: (context) => {
      assert.equal(context.createEntity({ id: 'player-1', type: 'player', dimension: '2d', position: { x: 0, y: 0 } }).ok, true);
    },
    update: () => { updates++; throw new Error('Broken gameplay update'); },
    render: () => {}, reset: () => {}, destroy: () => { destroyed++; },
  }, (error) => { failure = error; });
  try {
    const started = host.start();
    assert.equal(host.start(), started);
    const runtime = await started;
    engineStep();
    assert.match(String(failure), /Broken gameplay update/);
    assert.deepEqual(runtime.listEntities(), { ok: true, data: [] });
    engineStep();
    assert.equal(updates, 1);
    assert.equal(runtime.resetGame().ok, false);
    assert.equal(runtime.createEntity({ id: 'late', type: 'coin', dimension: '2d', position: { x: 0, y: 0 } }).ok, false);
    await assert.rejects(host.start(), /destroyed/);
  } finally { host.destroy(); }
  assert.equal(destroyed, 1);
});
