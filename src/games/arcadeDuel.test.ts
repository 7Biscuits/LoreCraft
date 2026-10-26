import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CombatMatch, FLOOR, moves, neutral } from './ken-vs-ryu/combat';
import type { FighterInput, MoveId } from './ken-vs-ryu/combat';
import { DuelInput } from './ken-vs-ryu/input';

const idle = (): [FighterInput, FighterInput] => [neutral(), neutral()];
function advance(m: CombatMatch, seconds: number, inputs = idle()) { for (let t = 0; t < seconds - 1e-7; t += 1 / 120) m.update(1 / 120, inputs); }
function fight(close = true) {
  const m = new CombatMatch(); m.start(); advance(m, 1.7); assert.equal(m.phase, 'fight');
  if (close) { m.fighters[0].x = 550; m.fighters[1].x = 609; }
  return m;
}
function strike(m: CombatMatch, id: MoveId, player = 0, down = false, target = neutral()) {
  const input = idle(); input[player] = { ...neutral(), down, attack: id }; input[1 - player] = target; m.update(1 / 120, input);
  input[player] = { ...neutral(), down }; advance(m, moves[id].startup + moves[id].active + .13, input);
}
test('all six punches and kicks work for each fighter, once per attack, with distinct damage', () => {
  for (const player of [0, 1]) for (const id of ['lp', 'mp', 'hp', 'lk', 'mk', 'hk'] as MoveId[]) {
    const m = fight(); strike(m, id, player);
    assert.equal(m.fighters[1 - player]!.health, 100 - moves[id].damage, `${player} ${id}`);
    const health = m.fighters[1 - player]!.health; advance(m, .8); assert.equal(m.fighters[1 - player]!.health, health);
  }
});
test('guard creates block stun, prevents normal damage, and low attacks require crouch guard', () => {
  const m = fight(); strike(m, 'hp', 0, false, { ...neutral(), x: 1 });
  assert.equal(m.fighters[1].health, 100); assert.ok(m.impacts.some(e => e.kind === 'block'));
  const low = fight(); strike(low, 'lk', 0, true, { ...neutral(), x: 1 }); assert.equal(low.fighters[1].health, 93);
  const guarded = fight(); strike(guarded, 'lk', 0, true, { ...neutral(), x: 1, down: true }); assert.equal(guarded.fighters[1].health, 100);
});
test('light → medium → heavy confirmed combo chaining works', () => {
  const m = fight();
  for (const id of ['lp', 'mp', 'hp'] as MoveId[]) {
    const before = m.fighters[1].health; m.update(1 / 120, [{ ...neutral(), attack: id }, neutral()]);
    for (let i = 0; i < 120 && m.fighters[1].health === before; i++) m.update(1 / 120, idle());
    assert.ok(m.fighters[1].health < before, id);
  }
  assert.equal(m.fighters[0].combo, 3); assert.ok(m.fighters[1].health < 75);
});
test('separate hits after hit stun expires start a new combo', () => {
  const m = fight(); strike(m, 'lp'); advance(m, .4);
  m.fighters[0].x = 550; m.fighters[1].x = 609;
  strike(m, 'lp'); assert.equal(m.fighters[0].combo, 1);
});
test('simultaneous strikes trade fairly, whiffs cannot damage, hit stun prevents retaliating', () => {
  const m = fight(); m.update(1 / 120, [{ ...neutral(), attack: 'lp' }, { ...neutral(), attack: 'lp' }]); advance(m, .2);
  assert.equal(m.fighters[0].health, 94); assert.equal(m.fighters[1].health, 94);
  const far = fight(false); strike(far, 'hk'); assert.equal(far.fighters[1].health, 100);
  const stunned = fight(); strike(stunned, 'hp'); assert.ok(stunned.fighters[1].stun > 0);
  stunned.update(1 / 120, [neutral(), { ...neutral(), attack: 'hp' }]); assert.equal(stunned.fighters[1].attack, undefined);
});
test('both specials work for both fighters; fireballs clash and cooldown prevents spam', () => {
  for (const player of [0, 1]) {
    const m = fight(false); strike(m, 'hadouken', player); advance(m, 1.1);
    assert.equal(m.fighters[1 - player]!.health, 87);
    const dp = fight(); strike(dp, 'shoryuken', player, true); assert.equal(dp.fighters[1 - player]!.health, 79); assert.ok(dp.fighters[player]!.y < FLOOR);
  }
  const clash = fight(false); clash.update(1 / 120, [{ ...neutral(), attack: 'hadouken' }, { ...neutral(), attack: 'hadouken' }]); advance(clash, 1);
  assert.equal(clash.projectiles.length, 0); assert.deepEqual(clash.fighters.map(f => f.health), [100, 100]);
  const cool = fight(false); strike(cool, 'hadouken'); advance(cool, .3); cool.update(1 / 120, [{ ...neutral(), attack: 'hadouken' }, neutral()]);
  assert.equal(cool.fighters[0].attack, undefined); assert.ok(cool.fighters[0].cooldown > 0);
});
test('special chip cannot KO a guard; jumping and crouching have correct hurtboxes', () => {
  const m = fight(false); m.fighters[1].health = 1;
  const guard: [FighterInput, FighterInput] = [neutral(), { ...neutral(), x: 1 }];
  m.update(1 / 120, [{ ...neutral(), attack: 'hadouken' }, guard[1]]); advance(m, 2, guard);
  assert.equal(m.fighters[1].health, 1);
  const jump = fight(false); jump.update(1 / 120, [{ ...neutral(), jump: true }, neutral()]); advance(jump, .15); assert.ok(jump.fighters[0].y < FLOOR - 40); advance(jump, 1); assert.equal(jump.fighters[0].y, FLOOR);
  const duck = fight(); strike(duck, 'hk', 0, false, { ...neutral(), down: true }); assert.equal(duck.fighters[1].health, 100);
});
test('fighters stay inside arena, separate in corners, turn, and recover after jumping across', () => {
  const m = fight(false); advance(m, 5, [{ ...neutral(), x: -1 }, { ...neutral(), x: 1 }]);
  assert.equal(m.fighters[0].x, 65); assert.equal(m.fighters[1].x, 1135);
  m.fighters[0].x = 65; m.fighters[1].x = 85; m.update(1 / 60, idle()); assert.ok(m.fighters[1].x - m.fighters[0].x >= 48);
  m.fighters[0].x = 850; m.fighters[1].x = 500; m.update(1 / 60, idle()); assert.equal(m.fighters[0].face, -1); assert.equal(m.fighters[1].face, 1);
});
test('complete first-to-two KO flow, round reset, victory and rematch', () => {
  const m = fight();
  for (let round = 0; round < 2; round++) {
    m.fighters[0].x = 550; m.fighters[1].x = 609; m.fighters[1].health = 5; strike(m, 'lp');
    assert.equal(m.phase, 'roundOver'); assert.equal(m.fighters[0].wins, round + 1);
    advance(m, 2.8);
    if (round === 0) { assert.equal(m.phase, 'intro'); assert.equal(m.fighters[1].health, 100); advance(m, 1.7); }
  }
  assert.equal(m.phase, 'matchOver'); assert.equal(m.winner, 0);
  m.start(); assert.equal(m.phase, 'intro'); assert.deepEqual(m.fighters.map(f => f.wins), [0, 0]); assert.deepEqual(m.fighters.map(f => f.health), [100, 100]); assert.equal(m.timer, 99);
});
test('timer decisions, draw replay, pause and reset are reliable', () => {
  const m = fight(); m.timer = .01; m.fighters[0].health = 70; m.fighters[1].health = 80; advance(m, .1); assert.equal(m.winner, 1); assert.equal(m.reason, 'TIME UP');
  const draw = fight(); draw.timer = 0; advance(draw, .1); assert.equal(draw.winner, -1); assert.deepEqual(draw.fighters.map(f => f.wins), [0, 0]); advance(draw, 2.8); assert.equal(draw.phase, 'intro');
  const pause = fight(); const timer = pause.timer; pause.paused = true; advance(pause, 1); assert.equal(pause.timer, timer); pause.start(); assert.equal(pause.paused, false);
});
test('independent simultaneous keyboard inputs, specials, scroll prevention and listener cleanup', () => {
  const oldWindow = globalThis.window, win = new EventTarget();
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
  const input = new DuelInput(); input.attach();
  function key(type: string, code: string) { const e = new Event(type, { cancelable: true }); Object.assign(e, { code, repeat: false }); win.dispatchEvent(e); return e; }
  try {
    key('keydown', 'KeyD'); key('keydown', 'KeyF'); assert.equal(key('keydown', 'ArrowLeft').defaultPrevented, true); key('keydown', 'KeyL');
    let sample = input.sample(); assert.equal(sample.fighters[0].x, 1); assert.equal(sample.fighters[0].attack, 'lp'); assert.equal(sample.fighters[1].x, -1); assert.equal(sample.fighters[1].attack, 'hp');
    assert.equal(input.sample().fighters[0].attack, undefined);
    key('keydown', 'KeyS'); key('keydown', 'KeyT'); key('keydown', 'ShiftRight'); sample = input.sample(); assert.equal(sample.fighters[0].attack, 'shoryuken'); assert.equal(sample.fighters[1].attack, 'hadouken');
    win.dispatchEvent(new Event('blur')); assert.equal(input.sample().fighters[0].x, 0);
    input.detach(); assert.equal(key('keydown', 'ArrowDown').defaultPrevented, false);
  } finally { input.detach(); Object.defineProperty(globalThis, 'window', { value: oldWindow, configurable: true, writable: true }); }
});
