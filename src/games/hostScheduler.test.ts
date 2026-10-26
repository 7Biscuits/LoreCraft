import assert from 'node:assert/strict';
import test from 'node:test';
import { setHeadlessMode } from 'littlejsengine';
import { AuthoredGameHost } from './host';
import type { GameModule } from './contract';

test('destroy stops the scheduled frame chain and a second host cannot claim the document', async () => {
  setHeadlessMode(true);
  const frames: FrameRequestCallback[] = [];
  const old = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  const game: GameModule = { id: 'scheduler-test', title: 'Scheduler', init() {}, update() {}, render() {}, reset() {}, destroy() {} };
  const host = new AuthoredGameHost(game);
  try {
    await host.start(); assert.equal(frames.length, 1);
    const duplicate = new AuthoredGameHost(game); await assert.rejects(duplicate.start(), /already has a host/);
    host.destroy(); frames.shift()!(performance.now() + 20);
    assert.equal(frames.length, 0, 'The disposed host scheduled another animation frame.');
    assert.equal(host.runtime.createEntity({ id: 'orphan', type: 'coin', dimension: '2d', position: { x: 0, y: 0 } }).ok, false);
  } finally { host.destroy(); globalThis.requestAnimationFrame = old; }
});
