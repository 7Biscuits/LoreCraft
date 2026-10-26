import { createGameEngine } from './engine.ts';
import type { GameSpec } from './spec.ts';

export interface Check { name: string; passed: boolean; detail: string }
/** Deterministic agent-facing scenarios, separate from the repository test suite. */
export function playtest(spec: GameSpec): Check[] {
  const checks: Check[] = [];
  const check = (name: string, run: () => string) => { try { checks.push({ name, passed: true, detail: run() }); } catch (e) { checks.push({ name, passed: false, detail: e instanceof Error ? e.message : String(e) }); } };
  const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
  check('Scene integrity', () => { const e = createGameEngine(spec); assert(new Set(e.state.entities.map((v) => v.id)).size === e.state.entities.length, 'Duplicate entity IDs.'); assert(e.state.entities.filter((v) => v.type === 'coin').length === spec.collectibleCount, 'Collectible count mismatch.'); return `${e.state.entities.length} unique live entities; objective count matches.`; });
  check('Seed reproducibility', () => { assert(JSON.stringify(createGameEngine(spec).snapshot()) === JSON.stringify(createGameEngine(spec).snapshot()), 'Scene is nondeterministic.'); return `Seed ${spec.seed} reproduces the same scene.`; });
  check('Player movement', () => { const e = createGameEngine(spec), x = e.state.entities[0]!.x; e.step({ x: 1, y: 0 }); assert(e.state.entities[0]!.x > x, 'Player does not move.'); return 'Simulated input advances the controlling entity.'; });
  check('World boundaries', () => { const e = createGameEngine(spec); e.state.entities = e.state.entities.filter((v) => v.type !== 'enemy'); for (let n = 0; n < 120; n++) e.step({ x: -1, y: -1 }); assert(e.state.entities.every((v) => v.type !== 'player' || v.x >= .6 && v.y >= .6), 'Player escaped the arena.'); return '120 boundary-directed frames stayed inside the world.'; });
  check('Objective reachability', () => {
    const e = createGameEngine(spec), walls = e.state.entities.filter((v) => v.type === 'obstacle');
    const blocked = (x: number, y: number) => walls.some((w) => Math.abs(x / 2 - w.x) < (w.w + .62) / 2 && Math.abs(y / 2 - w.y) < (w.h + .7) / 2);
    const seen = new Set<string>(['4,14']), queue = [[4, 14]];
    for (let n = 0; n < queue.length; n++) { const [x, y] = queue[n]!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x! + dx!, ny = y! + dy!, key = `${nx},${ny}`; if (nx >= 2 && nx <= 46 && ny >= 2 && ny <= 26 && !seen.has(key) && !blocked(nx, ny)) { seen.add(key); queue.push([nx, ny]); } } }
    if (spec.genre !== 'runner') for (const gem of e.state.entities.filter((v) => v.type === 'coin')) assert(seen.has(`${Math.round(gem.x * 2)},${Math.round(gem.y * 2)}`), `${gem.id} is unreachable.`);
    assert(seen.has('44,14'), 'Portal is unreachable.'); return 'Flood-fill verified connected routes to every gem and the portal.';
  });
  check('Collision sweep', () => { const e = createGameEngine(spec), p = e.state.entities[0]!; e.state.entities = [p, { ...p, id: 'test-wall', type: 'obstacle', x: 4, y: 7, w: .1, h: 4, speed: 0 }]; p.speed = 1000; e.step({ x: 1, y: 0 }); assert(p.x < 4, 'Player tunneled through a thin wall.'); return 'A 1,000 unit/s movement cannot tunnel through a thin wall.'; });
  check('Damage and loss', () => { const e = createGameEngine(spec), p = e.state.entities[0]!; e.state.health = 1; e.state.entities.push({ ...p, id: 'test-enemy', type: 'enemy', speed: 0 }); e.step(); assert(e.state.outcome === 'lost', 'Damage did not trigger loss.'); return 'Enemy contact at one remaining heart triggers a loss.'; });
  check('Victory condition', () => { const e = createGameEngine(spec); e.state.entities = e.state.entities.filter((v) => v.type !== 'enemy'); if (spec.genre === 'survival' || spec.genre === 'runner') e.state.elapsed = spec.timeLimit - .001; else { e.state.collected = spec.collectibleCount; e.state.entities[0]!.x = 22; e.state.entities[0]!.y = 7; } e.step(); assert(e.state.outcome === 'won', 'Victory did not trigger.'); return 'Satisfied objective triggers victory (isolated, hazards removed).'; });
  check('Simulation stability', () => { const e = createGameEngine(spec); for (let n = 0; n < 600; n++) e.step({ x: Math.sin(n / 40), y: Math.cos(n / 40), action: true, dash: n % 90 === 0 }); assert(e.state.entities.every((v) => [v.x, v.y, v.w, v.h].every(Number.isFinite)), 'Non-finite entity state.'); return '600 deterministic gameplay frames produced finite entity state.'; });
  check('Checkpoint and reset', () => { const e = createGameEngine(spec), original = JSON.stringify(e.snapshot()); e.step({ x: 1, y: 0 }); const saved = e.snapshot(); e.step(); e.restore(saved); assert(JSON.stringify(e.snapshot()) === JSON.stringify(saved), 'Checkpoint round-trip changed state.'); e.reset(); assert(JSON.stringify(e.snapshot()) === original, 'Reset changed the initial scene.'); return 'Checkpoint restoration and a full reset reproduce exact snapshots.'; });
  return checks;
}
