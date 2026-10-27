import test from 'node:test';
import assert from 'node:assert/strict';
import { SwordMatch, moves } from './sword-duel/combat';
import type { Attack } from './sword-duel/combat';

function setup(distance = 60) {
  const match = new SwordMatch(); match.start();
  match.fighters[0].x = 400; match.fighters[1].x = 400 + distance;
  return match;
}
for (const kind of ['punch', 'kick', 'sword'] as Attack[]) {
  test(`${kind} deals damage once per attack and misses outside its reach`, () => {
    const m = setup();
    m.update(0.8, [{ move: 0, attack: kind }, { move: 0 }]);
    assert.equal(m.fighters[1].health, 100 - moves[kind].damage);
    const miss = setup(moves[kind].range + 10);
    miss.update(0.8, [{ move: 0, attack: kind }, { move: 0 }]);
    assert.equal(miss.fighters[1].health, 100);
  });
}
test('guard absorbs a sword and jumping avoids a grounded strike', () => {
  const m = setup(); m.update(0.8, [{ move: 0, attack: 'sword' }, { move: 0, block: true }]);
  assert.equal(m.fighters[1].health, 100);
  const jump = setup(); jump.update(0.8, [{ move: 0, attack: 'sword' }, { move: 0, jump: true }]);
  assert.equal(jump.fighters[1].health, 100);
});
test('two round wins finish a match; next round restores health', () => {
  const m = setup(); m.fighters[1].health = 1;
  m.update(0.4, [{ move: 0, attack: 'sword' }, { move: 0 }]);
  assert.equal(m.phase, 'roundOver'); assert.equal(m.fighters[0].wins, 1);
  m.update(3, [{ move: 0 }, { move: 0 }]);
  assert.equal(m.fighters[1].health, 100); assert.equal(m.round, 2);
  m.fighters[0].x = 400; m.fighters[1].x = 460; m.fighters[1].health = 1;
  m.update(0.4, [{ move: 0, attack: 'sword' }, { move: 0 }]);
  assert.equal(m.phase, 'matchOver'); assert.equal(m.winner, 0);
});
