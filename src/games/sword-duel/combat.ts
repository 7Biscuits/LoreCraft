export type Attack = 'punch' | 'kick' | 'sword';
export interface Input { move: number; jump?: boolean; block?: boolean; attack?: Attack }
export const moves = {
  punch: { damage: 8, range: 76, windup: 0.08, duration: 0.3 },
  kick: { damage: 12, range: 104, windup: 0.16, duration: 0.48 },
  sword: { damage: 19, range: 147, windup: 0.26, duration: 0.72 },
};
export class Fighter {
  health = 100; wins = 0; y = 0; vy = 0; stun = 0; blocking = false;
  attack?: { kind: Attack; elapsed: number; hit: boolean };
  flash = 0; walk = 0;
  constructor(public x: number, public face: number) {}
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export class SwordMatch {
  fighters = [new Fighter(300, 1), new Fighter(660, -1)] as [Fighter, Fighter];
  phase: 'ready' | 'fight' | 'roundOver' | 'matchOver' = 'ready';
  paused = false; timer = 60; round = 1; winner = -1; breakTime = 0;
  sparks: { x: number; y: number; life: number; blocked: boolean }[] = [];
  start(): void { if (this.phase === 'ready') this.phase = 'fight'; }
  nextRound(): void {
    const wins = this.fighters.map(f => f.wins);
    this.fighters = [new Fighter(300, 1), new Fighter(660, -1)];
    this.fighters.forEach((f, i) => f.wins = wins[i]!);
    this.round++; this.timer = 60; this.phase = 'fight'; this.sparks = [];
  }
  update(seconds: number, inputs: [Input, Input]): void {
    if (this.paused || this.phase === 'ready' || this.phase === 'matchOver') return;
    if (this.phase === 'roundOver') { this.breakTime -= seconds; if (this.breakTime <= 0) this.nextRound(); return; }
    const steps = Math.max(1, Math.ceil(seconds / (1 / 120)));
    const dt = seconds / steps;
    for (let step = 0; step < steps && this.phase === 'fight'; step++) {
      this.timer = Math.max(0, this.timer - dt);
      this.sparks = this.sparks.filter(s => (s.life -= dt) > 0);
      this.fighters.forEach((f, i) => {
        const input = inputs[i]!, other = this.fighters[1 - i]!;
        f.flash = Math.max(0, f.flash - dt); f.stun = Math.max(0, f.stun - dt);
        if (!f.attack) f.face = other.x >= f.x ? 1 : -1;
        f.blocking = !!input.block && f.y === 0 && !f.attack && f.stun === 0;
        if (step === 0 && f.stun === 0 && !f.attack && !f.blocking) {
          if (input.jump && f.y === 0) f.vy = 590;
          if (input.attack) f.attack = { kind: input.attack, elapsed: 0, hit: false };
        }
        if (f.stun === 0 && !f.attack && !f.blocking) { f.x += clamp(input.move, -1, 1) * 225 * dt; f.walk += Math.abs(input.move) * dt * 11; }
        f.x = clamp(f.x, 60, 900);
        f.y += f.vy * dt; f.vy -= 1500 * dt;
        if (f.y <= 0) { f.y = 0; f.vy = 0; }
        if (f.attack) f.attack.elapsed += dt;
      });
      const [a, b] = this.fighters;
      if (Math.abs(a.x - b.x) < 46 && Math.abs(a.y - b.y) < 85) {
        const sign = a.x <= b.x ? 1 : -1, overlap = (46 - Math.abs(a.x - b.x)) / 2;
        a.x = clamp(a.x - sign * overlap, 60, 900); b.x = clamp(b.x + sign * overlap, 60, 900);
      }
      // Resolve both attacks before deciding the round so simultaneous hits can trade.
      for (let i = 0; i < 2; i++) {
        const f = this.fighters[i]!, other = this.fighters[1 - i]!, attack = f.attack;
        if (!attack) continue;
        const move = moves[attack.kind];
        if (!attack.hit && attack.elapsed >= move.windup && attack.elapsed <= move.windup + 0.1 &&
          (other.x - f.x) * f.face > 0 && Math.abs(other.x - f.x) <= move.range && Math.abs(f.y - other.y) < 80) {
          attack.hit = true;
          const blocked = other.blocking && other.face === -f.face;
          other.health = Math.max(0, other.health - (blocked ? 0 : move.damage));
          other.stun = blocked ? 0.08 : 0.17;
          other.flash = 0.15;
          other.x = clamp(other.x + f.face * (blocked ? 6 : 18), 60, 900);
          this.sparks.push({ x: other.x - f.face * 20, y: 362 - other.y, life: 0.22, blocked });
        }
        if (attack.elapsed >= move.duration) f.attack = undefined;
      }
      if (a.health <= 0 || b.health <= 0 || this.timer <= 0) {
        this.winner = a.health === b.health ? -1 : a.health > b.health ? 0 : 1;
        if (this.winner >= 0) this.fighters[this.winner]!.wins++;
        this.phase = this.fighters.some(f => f.wins >= 2) ? 'matchOver' : 'roundOver';
        this.breakTime = 2.2;
      }
    }
  }
}
