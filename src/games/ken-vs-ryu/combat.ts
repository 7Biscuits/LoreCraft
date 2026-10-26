export type MoveId = 'lp' | 'mp' | 'hp' | 'lk' | 'mk' | 'hk' | 'hadouken' | 'shoryuken';
export interface Move { label: string; startup: number; active: number; recovery: number; damage: number; range: number; height: number; rank: number; stun: number; push: number; kind: 'punch' | 'kick' | 'fireball' | 'uppercut' }
export const moves: Record<MoveId, Move> = {
  lp: { label: 'LIGHT PUNCH', startup: .065, active: .085, recovery: .16, damage: 6, range: 72, height: 78, rank: 1, stun: .29, push: 100, kind: 'punch' },
  mp: { label: 'MEDIUM PUNCH', startup: .115, active: .1, recovery: .22, damage: 10, range: 91, height: 75, rank: 2, stun: .35, push: 145, kind: 'punch' },
  hp: { label: 'HEAVY PUNCH', startup: .19, active: .12, recovery: .32, damage: 16, range: 111, height: 80, rank: 3, stun: .43, push: 200, kind: 'punch' },
  lk: { label: 'LIGHT KICK', startup: .085, active: .09, recovery: .18, damage: 7, range: 84, height: 43, rank: 1, stun: .29, push: 105, kind: 'kick' },
  mk: { label: 'MEDIUM KICK', startup: .14, active: .12, recovery: .25, damage: 11, range: 112, height: 60, rank: 2, stun: .37, push: 155, kind: 'kick' },
  hk: { label: 'HEAVY KICK', startup: .22, active: .14, recovery: .36, damage: 17, range: 134, height: 83, rank: 3, stun: .46, push: 220, kind: 'kick' },
  hadouken: { label: 'HADOUKEN', startup: .24, active: .1, recovery: .36, damage: 13, range: 0, height: 62, rank: 4, stun: .4, push: 180, kind: 'fireball' },
  shoryuken: { label: 'SHORYUKEN', startup: .09, active: .29, recovery: .62, damage: 21, range: 80, height: 80, rank: 4, stun: .58, push: 260, kind: 'uppercut' },
};
export interface FighterInput { x: number; down: boolean; jump: boolean; attack?: MoveId }
export const neutral = (): FighterInput => ({ x: 0, down: false, jump: false });
export interface Attack { id: MoveId; time: number; hit: boolean; confirmed: boolean; emitted: boolean; crouched: boolean; airborne: boolean }
export interface Fighter {
  name: 'KEN' | 'RYU'; x: number; y: number; vx: number; vy: number; face: number; health: number; wins: number;
  crouch: boolean; walking: boolean; stun: number; guard: number; flash: number; cooldown: number; combo: number; comboTime: number;
  attack?: Attack; buffer?: MoveId; bufferTime: number; input: FighterInput;
}
export interface Projectile { owner: number; x: number; y: number; direction: number; life: number }
export interface Impact { x: number; y: number; age: number; kind: 'hit' | 'block' | 'clash' | 'special'; power: number }
export const FLOOR = 532;
const makeFighter = (name: 'KEN' | 'RYU', x: number, face: number, wins = 0): Fighter => ({ name, x, y: FLOOR, face, wins, vx: 0, vy: 0, health: 100, crouch: false, walking: false, stun: 0, guard: 0, flash: 0, cooldown: 0, combo: 0, comboTime: 0, bufferTime: 0, input: neutral() });
export interface Rect { x: number; y: number; w: number; h: number }
export const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const hurtbox = (f: Fighter): Rect => ({ x: f.x - 23, y: f.y - (f.crouch ? 66 : 108), w: 46, h: f.crouch ? 66 : 108 });
export function hitbox(f: Fighter): Rect | undefined {
  const a = f.attack; if (!a) return;
  const m = moves[a.id]; if (m.kind === 'fireball' || a.time < m.startup || a.time >= m.startup + m.active || a.hit) return;
  const height = a.crouched ? m.kind === 'kick' ? 22 : 46 : m.height;
  return { x: f.face > 0 ? f.x + 10 : f.x - m.range, y: f.y - height - 17, w: m.range - 10, h: m.kind === 'uppercut' ? 100 : 34 };
}
export class CombatMatch {
  fighters: [Fighter, Fighter] = [makeFighter('KEN', 330, 1), makeFighter('RYU', 870, -1)];
  phase: 'title' | 'intro' | 'fight' | 'roundOver' | 'matchOver' = 'title';
  timer = 99;
  round = 1;
  phaseTime = 0;
  clock = 0;
  paused = false;
  winner = -1;
  reason = '';
  projectiles: Projectile[] = [];
  impacts: Impact[] = [];
  shake = 0;
  hitstop = 0;
  sounds: string[] = [];
  start(): void { this.fighters = [makeFighter('KEN', 330, 1), makeFighter('RYU', 870, -1)]; this.round = 1; this.resetRound(); }
  resetRound(): void {
    this.fighters = [makeFighter('KEN', 330, 1, this.fighters[0].wins), makeFighter('RYU', 870, -1, this.fighters[1].wins)];
    this.projectiles = []; this.impacts = []; this.timer = 99; this.phase = 'intro'; this.phaseTime = 0; this.winner = -1; this.reason = ''; this.paused = false; this.hitstop = 0; this.shake = 0;
  }
  update(seconds: number, inputs: [FighterInput, FighterInput]): void {
    this.sounds = [];
    if (this.paused) return;
    let left = Math.min(.1, Math.max(0, seconds));
    // Edge inputs are latched once; held movement is sampled on every substep.
    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i]!, input = inputs[i]!; f.input = input;
      if (input.attack && this.phase === 'fight') { f.buffer = input.attack; f.bufferTime = .16; }
    }
    let first = true;
    while (left > 1e-8) {
      const dt = Math.min(left, 1 / 120); left -= dt;
      this.tick(dt, first); first = false;
    }
  }
  private tick(dt: number, edge: boolean): void {
    this.clock += dt; this.phaseTime += dt;
    this.impacts = this.impacts.filter(e => (e.age += dt) < .4);
    this.shake = Math.max(0, this.shake - dt * 25);
    if (this.phase === 'title' || this.phase === 'matchOver') return;
    if (this.phase === 'intro') { if (this.phaseTime >= 1.6) { this.phase = 'fight'; this.phaseTime = 0; this.sounds.push('start'); } return; }
    if (this.phase === 'roundOver') {
      if (this.phaseTime > 2.7) {
        if (this.fighters.some(f => f.wins >= 2)) { this.phase = 'matchOver'; this.phaseTime = 0; }
        else { this.round++; this.resetRound(); }
      }
      return;
    }
    if (this.hitstop > 0) { this.hitstop = Math.max(0, this.hitstop - dt); return; }
    this.timer = Math.max(0, this.timer - dt);
    for (let i = 0; i < 2; i++) this.advanceFighter(i, dt, edge);
    this.separate();
    // Collect both players' strikes before applying damage: simultaneous attacks trade fairly.
    const strikes: { owner: number; move: MoveId; box: Rect; blocked: boolean }[] = [];
    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i]!, target = this.fighters[1 - i]!, box = hitbox(f);
      if (box && overlap(box, hurtbox(target)) && !this.invulnerable(target)) {
        strikes.push({ owner: i, move: f.attack!.id, box, blocked: this.canBlock(target, f.x, f.attack!.crouched && moves[f.attack!.id].kind === 'kick', f.attack!.airborne) });
        f.attack!.hit = true; f.attack!.confirmed = true;
      }
    }
    for (const strike of strikes) this.hit(strike.owner, strike.move, strike.blocked, strike.box.y + strike.box.h / 2);
    for (const p of this.projectiles) { p.x += p.direction * 480 * dt; p.life -= dt; }
    for (let i = 0; i < this.projectiles.length; i++) for (let j = i + 1; j < this.projectiles.length; j++) {
      const a = this.projectiles[i]!, b = this.projectiles[j]!;
      if (a.life > 0 && b.life > 0 && a.owner !== b.owner && Math.abs(a.x - b.x) < 42 && Math.abs(a.y - b.y) < 35) {
        a.life = b.life = 0; this.impacts.push({ x: (a.x + b.x) / 2, y: a.y, age: 0, kind: 'clash', power: 2 }); this.sounds.push('block');
      }
    }
    for (const p of this.projectiles) {
      const target = this.fighters[1 - p.owner]!;
      if (p.life > 0 && overlap({ x: p.x - 20, y: p.y - 18, w: 40, h: 36 }, hurtbox(target)) && !this.invulnerable(target)) {
        this.hit(p.owner, 'hadouken', this.canBlock(target, p.x - p.direction * 40, false, false), p.y); p.life = 0;
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0 && p.x > -80 && p.x < 1280);
    if (this.fighters.some(f => f.health <= 0) || this.timer <= 0) this.endRound();
  }
  private invulnerable(f: Fighter): boolean { return f.attack?.id === 'shoryuken' && f.attack.time < .16; }
  private canBlock(f: Fighter, sourceX: number, low: boolean, high: boolean): boolean {
    const away = Math.sign(f.x - sourceX);
    return f.y >= FLOOR - 1 && !f.attack && f.stun <= 0 && f.input.x === away && (!low || f.crouch) && (!high || !f.crouch);
  }
  private advanceFighter(index: number, dt: number, edge: boolean): void {
    const f = this.fighters[index]!, other = this.fighters[1 - index]!, input = f.input;
    f.cooldown = Math.max(0, f.cooldown - dt); f.flash = Math.max(0, f.flash - dt);
    f.comboTime = Math.max(0, f.comboTime - dt); if (!f.comboTime) f.combo = 0;
    f.stun = Math.max(0, f.stun - dt); f.guard = Math.max(0, f.guard - dt);
    f.bufferTime -= dt; if (f.bufferTime <= 0) f.buffer = undefined;
    f.walking = false;
    if (!f.attack && f.stun <= 0) f.face = other.x >= f.x ? 1 : -1;
    f.crouch = f.y >= FLOOR && input.down && !f.attack && f.stun <= 0;
    const free = f.stun <= 0 && f.guard <= 0;
    if (free && f.buffer) {
      const old = f.attack, next = moves[f.buffer];
      const cancel = old?.confirmed && old.time >= moves[old.id].startup && next.rank > moves[old.id].rank && old.time < moves[old.id].startup + moves[old.id].active + .2;
      const special = next.rank === 4;
      if ((!old || cancel) && (!special || (f.cooldown <= 0 && f.y >= FLOOR))) {
        const id = f.buffer;
        f.attack = { id, time: 0, hit: false, confirmed: false, emitted: false, crouched: f.crouch, airborne: f.y < FLOOR };
        f.buffer = undefined;
        if (special) f.cooldown = id === 'shoryuken' ? 1.7 : 1.15;
        if (id === 'shoryuken') { f.vy = -700; f.crouch = false; this.sounds.push('uppercut'); }
        else this.sounds.push('swing');
      }
    }
    if (free && !f.attack) {
      if (edge && input.jump && f.y >= FLOOR && !input.down) { f.vy = -650; f.crouch = false; this.sounds.push('jump'); }
      if (!f.crouch) { f.x += input.x * (f.y < FLOOR ? 195 : 225) * dt; f.walking = !!input.x && f.y >= FLOOR; }
    }
    if (f.attack) {
      const a = f.attack, m = moves[a.id]; a.time += dt;
      if (a.id === 'shoryuken' && a.time < .38) f.x += f.face * 150 * dt;
      if (a.id === 'hadouken' && !a.emitted && a.time >= m.startup) {
        a.emitted = true; this.projectiles.push({ owner: index, x: f.x + f.face * 65, y: f.y - 62, direction: f.face, life: 3 }); this.sounds.push('fireball');
      }
      if (a.time >= m.startup + m.active + m.recovery) f.attack = undefined;
    }
    f.x += f.vx * dt; f.vx *= Math.exp(-9 * dt);
    if (f.y < FLOOR || f.vy < 0) { f.vy += 1800 * dt; f.y += f.vy * dt; if (f.y >= FLOOR) { f.y = FLOOR; f.vy = 0; } }
    f.x = Math.max(65, Math.min(1135, f.x));
  }
  private separate(): void {
    const [a, b] = this.fighters;
    if (Math.abs(a.y - b.y) > 100) return;
    const distance = b.x - a.x, penetration = 48 - Math.abs(distance);
    if (penetration <= 0) return;
    const direction = distance >= 0 ? 1 : -1;
    a.x = Math.max(65, Math.min(1135, a.x - direction * penetration / 2));
    b.x = Math.max(65, Math.min(1135, b.x + direction * penetration / 2));
    // Transfer the remaining separation to the free fighter when the other is cornered.
    if (Math.abs(a.x - b.x) < 48) {
      if (a.x === 65 || a.x === 1135) b.x = a.x + direction * 48;
      else a.x = b.x - direction * 48;
    }
  }
  private hit(owner: number, id: MoveId, blocked: boolean, y: number): void {
    const attacker = this.fighters[owner]!, target = this.fighters[1 - owner]!, m = moves[id];
    const direction = target.x >= attacker.x ? 1 : -1;
    const scaled = m.damage * Math.max(.55, 1 - attacker.combo * .08);
    // Guard never chips below one life, so every KO requires a clean hit.
    target.health = blocked ? Math.max(1, target.health - (m.rank === 4 ? 2 : 0)) : Math.max(0, target.health - Math.round(scaled));
    if (blocked) { target.guard = .18 + m.rank * .035; target.vx = direction * m.push * .45; }
    else {
      attacker.combo = target.stun > 0 && attacker.combo > 0 ? attacker.combo + 1 : 1;
      target.stun = m.stun; target.guard = 0; target.attack = undefined; target.buffer = undefined; target.flash = .14;
      target.vx = direction * m.push; attacker.comboTime = 1.1;
      if (id === 'shoryuken') { target.vy = -400; target.y -= 1; }
    }
    this.impacts.push({ x: target.x - direction * 18, y, age: 0, kind: blocked ? 'block' : 'hit', power: m.rank });
    this.hitstop = blocked ? .025 : .035 + m.rank * .009; this.shake = blocked ? 1 : m.rank * 2;
    this.sounds.push(blocked ? 'block' : 'hit');
  }
  private endRound(): void {
    const [a, b] = this.fighters;
    this.winner = a.health === b.health ? -1 : a.health > b.health ? 0 : 1;
    this.reason = this.timer <= 0 ? 'TIME UP' : this.winner === -1 ? 'DOUBLE KO' : 'K.O.';
    if (this.winner >= 0) this.fighters[this.winner]!.wins++;
    this.phase = 'roundOver'; this.phaseTime = 0; this.projectiles = []; this.sounds.push('ko');
    for (const f of this.fighters) { f.attack = undefined; f.buffer = undefined; }
  }
}
