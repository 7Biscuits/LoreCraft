import type { GameSpec } from './spec.ts';

export interface WorldEntity { id: string; type: 'player' | 'coin' | 'enemy' | 'obstacle' | 'bullet'; x: number; y: number; w: number; h: number; speed: number; hp: number; vx: number; vy: number }
export interface WorldState { entities: WorldEntity[]; elapsed: number; score: number; collected: number; kills: number; health: number; outcome: 'playing' | 'won' | 'lost'; invulnerable: number; dashCooldown: number; shotCooldown: number; seed: number; tick: number; effects: { x: number; y: number; life: number; color: string }[] }
export interface GameInput { x: number; y: number; action?: boolean; dash?: boolean }

/** All runtime dependencies live inside this function so exports run offline, without a server. */
export function createGameEngine(spec: GameSpec) {
  const colors = {
    forest: { bg: '#102a26', floor: '#1e4034', grid: '#294a3a', wall: '#315947', accent: '#a9efd0', gem: '#b89fff', enemy: '#f5a391', sky: '#162e2c' },
    space: { bg: '#0e152d', floor: '#16213d', grid: '#23304d', wall: '#394563', accent: '#86dcff', gem: '#dfb4ff', enemy: '#ff8f9d', sky: '#0a1020' },
    dungeon: { bg: '#1c1728', floor: '#302a3a', grid: '#3b3446', wall: '#595064', accent: '#d6b5ff', gem: '#f3cc78', enemy: '#ff9e90', sky: '#15121f' },
    ocean: { bg: '#102c3a', floor: '#174555', grid: '#245160', wall: '#36767a', accent: '#9aeee2', gem: '#ffe7b0', enemy: '#f5a8c6', sky: '#102733' },
    neon: { bg: '#17152d', floor: '#27213c', grid: '#382c50', wall: '#514164', accent: '#e4b3ff', gem: '#8ff4dc', enemy: '#ff8cb1', sky: '#111020' },
  }[spec.theme];
  let state: WorldState;
  const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
  const random = () => { state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0; return state.seed / 4294967296; };
  const entity = (id: string, type: WorldEntity['type'], x: number, y: number, w = .6, h = w, speed = 0): WorldEntity => ({ id, type, x, y, w, h, speed, hp: 1, vx: 0, vy: 0 });
  const overlap = (a: WorldEntity, b: WorldEntity) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
  const remove = (e: WorldEntity) => { state.entities = state.entities.filter((v) => v !== e); };
  const burst = (e: WorldEntity, color: string) => { for (let n = 0; n < 8; n++) state.effects.push({ x: e.x + (random() - .5) * .7, y: e.y + (random() - .5) * .7, life: .4 + random() * .3, color }); };
  function reset() {
    state = { entities: [], elapsed: 0, score: 0, collected: 0, kills: 0, health: spec.lives, outcome: 'playing', invulnerable: 0, dashCooldown: 0, shotCooldown: 0, seed: spec.seed, tick: 0, effects: [] };
    state.entities.push(entity('player-1', 'player', 2, 7, .62, .7, spec.playerSpeed));
    if (spec.genre !== 'runner') {
      // Short islands leave a navigable perimeter and connected corridors in every generated map.
      for (let n = 0; n < 10; n++) {
        const x = 5 + (n % 5) * 3.2, y = n < 5 ? 3.4 : 10.6;
        state.entities.push(entity(`wall-${n + 1}`, 'obstacle', x, y, 1.5, 1.5));
      }
    }
    for (let n = 0; n < spec.collectibleCount; n++) {
      const x = spec.genre === 'runner' ? 5 + n * 2.5 : 4 + (n % 6) * 3;
      const y = spec.genre === 'runner' ? 3 + (n % 3) * 4 : n < 6 ? 6 + Math.sin(n * 2) * 1.4 : n < 12 ? 1.4 : 12.6;
      state.entities.push(entity(`gem-${n + 1}`, 'coin', x, y, .4));
    }
    for (let n = 0; n < spec.enemyCount; n++) {
      state.entities.push(entity(`enemy-${n + 1}`, 'enemy', 13 + random() * 9, 2 + random() * 10, .65, .65, spec.enemySpeed));
    }
    return state;
  }
  function move(e: WorldEntity, dx: number, dy: number) {
    // Axis-aligned sweep prevents tunneling even for a dash or externally edited speed.
    const walls = state.entities.filter((v) => v.type === 'obstacle');
    for (const axis of ['x', 'y'] as const) {
      const delta = axis === 'x' ? dx : dy, other = axis === 'x' ? 'y' : 'x';
      let next = clamp(e[axis] + delta, .6, axis === 'x' ? 23.4 : 13.4);
      for (const wall of walls) {
        const half = ((axis === 'x' ? e.w : e.h) + (axis === 'x' ? wall.w : wall.h)) / 2;
        const cross = ((axis === 'x' ? e.h : e.w) + (axis === 'x' ? wall.h : wall.w)) / 2;
        if (Math.abs(e[other] - wall[other]) >= cross) continue;
        if (delta > 0 && e[axis] <= wall[axis] - half) next = Math.min(next, wall[axis] - half);
        if (delta < 0 && e[axis] >= wall[axis] + half) next = Math.max(next, wall[axis] + half);
      }
      e[axis] = next;
    }
  }
  function step(input: GameInput = { x: 0, y: 0 }, dt = 1 / 60) {
    if (state.outcome !== 'playing') return state;
    dt = clamp(dt, 0, 1 / 15);
    state.elapsed += dt; state.tick++;
    state.invulnerable = Math.max(0, state.invulnerable - dt);
    state.dashCooldown = Math.max(0, state.dashCooldown - dt);
    state.shotCooldown = Math.max(0, state.shotCooldown - dt);
    state.effects = state.effects.filter((effect) => (effect.life -= dt) > 0);
    const player = state.entities.find((e) => e.id === 'player-1' && e.type === 'player');
    if (!player) { state.outcome = 'lost'; return state; }
    const length = Math.max(1, Math.hypot(input.x, input.y));
    let speed = player.speed;
    if (input.dash && state.dashCooldown <= 0) { speed *= 5; state.dashCooldown = 1.3; state.invulnerable = .3; burst(player, colors.accent); }
    move(player, clamp(input.x, -1, 1) / length * speed * dt, clamp(input.y, -1, 1) / length * speed * dt);
    const enemies = state.entities.filter((e) => e.type === 'enemy');
    if (spec.genre === 'shooter' && state.shotCooldown <= 0 && enemies.length) {
      const target = enemies.reduce((a, b) => Math.hypot(a.x - player.x, a.y - player.y) < Math.hypot(b.x - player.x, b.y - player.y) ? a : b);
      const d = Math.max(.01, Math.hypot(target.x - player.x, target.y - player.y));
      const bullet = entity(`shot-${state.tick}`, 'bullet', player.x, player.y, .16);
      bullet.vx = (target.x - player.x) / d * 14; bullet.vy = (target.y - player.y) / d * 14;
      state.entities.push(bullet); state.shotCooldown = input.action ? .15 : .35;
    }
    for (const e of [...state.entities]) {
      if (e.type === 'enemy') {
        if (spec.genre === 'runner') { e.x -= (2.5 + state.elapsed * .025) * dt; if (e.x < 0) { e.x = 25 + random() * 5; e.y = 2 + random() * 10; } }
        else { const d = Math.max(.01, Math.hypot(player.x - e.x, player.y - e.y)); move(e, (player.x - e.x) / d * e.speed * dt, (player.y - e.y) / d * e.speed * dt); }
        if (overlap(player, e) && state.invulnerable <= 0) { state.health--; state.invulnerable = 1.8; burst(player, colors.enemy); if (state.health <= 0) state.outcome = 'lost'; }
      }
      if (e.type === 'coin') {
        if (spec.genre === 'runner') { e.x -= 2.5 * dt; if (e.x < 0) { e.x = 25 + random() * 8; e.y = 2 + random() * 10; } }
        if (overlap(player, e)) { state.collected++; state.score += 100; burst(e, colors.gem); remove(e); }
      }
      if (e.type === 'bullet') {
        e.x += e.vx * dt; e.y += e.vy * dt;
        const hit = enemies.find((v) => state.entities.includes(v) && overlap(e, v));
        if (hit) { remove(hit); remove(e); state.kills++; state.score += 200; burst(hit, colors.enemy); }
        else if (e.x < 0 || e.x > 24 || e.y < 0 || e.y > 14 || state.entities.some((v) => v.type === 'obstacle' && overlap(e, v))) remove(e);
      }
    }
    if (state.outcome === 'playing') {
      if (spec.genre === 'survival' || spec.genre === 'runner') { if (state.elapsed >= spec.timeLimit) state.outcome = 'won'; }
      else if (state.collected >= spec.collectibleCount && (spec.genre !== 'shooter' || !state.entities.some((e) => e.type === 'enemy')) && Math.hypot(player.x - 22, player.y - 7) < 1.1) state.outcome = 'won';
      else if (state.elapsed >= spec.timeLimit) state.outcome = 'lost';
    }
    if (state.outcome === 'won') state.score += Math.round(state.health * 100);
    return state;
  }
  function draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const scale = Math.min(width / 960, height / 560), ox = (width - 960 * scale) / 2, oy = (height - 560 * scale) / 2;
    ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
    ctx.fillStyle = colors.floor; ctx.fillRect(0, 0, 960, 560);
    const rect = (x: number, y: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
    for (let y = 0; y < 14; y++) for (let x = 0; x < 24; x++) {
      const n = ((x * 71 + y * 37 + spec.seed) % 19) / 19;
      if (n > .55) rect(x * 40 + 9, y * 40 + 14, 3, 3, colors.grid);
      if (n < .15) { rect(x * 40, y * 40 + 39, 40, 1, colors.grid); rect(x * 40 + 39, y * 40, 1, 40, colors.grid); }
    }
    const t = state.elapsed;
    // Decorative edge vegetation / stars: deterministic and independent of simulation state.
    for (let i = 0; i < 55; i++) {
      const x = (i * 173 + spec.seed % 300) % 960, y = i % 2 ? 8 + i % 15 : 528 + i % 15;
      if (spec.theme === 'forest') {
        rect(x - 3, y + 7, 6, 12, '#715e48'); rect(x - 14, y - 10, 28, 20, '#1b352c'); rect(x - 10, y - 17, 20, 24, '#38674c'); rect(x - 7, y - 15, 9, 6, '#4b7c56');
      } else if (spec.theme === 'ocean') {
        rect(x, y, 4, 17, '#589184'); rect(x - 6, y + 4, 6, 4, '#73b6a1'); rect(x + 4, y + 8, 8, 4, '#ba8caa');
      } else { rect(x, y, 2 + i % 3, 2 + i % 3, i % 3 ? colors.grid : colors.accent); }
    }
    // Portal pulses only after the objective is complete.
    const unlocked = state.collected >= spec.collectibleCount && (spec.genre !== 'shooter' || !state.entities.some((e) => e.type === 'enemy'));
    if (spec.genre === 'adventure' || spec.genre === 'shooter') {
      const px = 880, py = 280;
      ctx.save(); ctx.translate(px, py); ctx.globalAlpha = unlocked ? .8 : .25;
      ctx.shadowColor = colors.accent; ctx.shadowBlur = unlocked ? 24 : 0;
      ctx.strokeStyle = colors.accent; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, 0, 15 + Math.sin(t * 3) * 2, 24, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha *= .4; ctx.fillStyle = colors.accent; ctx.fill(); ctx.restore();
      ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = colors.accent; ctx.fillText(unlocked ? 'PORTAL OPEN' : 'PORTAL LOCKED', px, py + 42);
    }
    const objects = [...state.entities].sort((a, b) => a.y - b.y);
    for (const e of objects) {
      const x = e.x * 40, y = e.y * 40;
      if (e.type === 'obstacle') {
        if (spec.theme === 'forest') {
          rect(x - 5, y + 8, 10, 24, '#795f46'); rect(x - 31, y - 15, 62, 35, '#17362c'); rect(x - 26, y - 32, 52, 39, '#305e42'); rect(x - 18, y - 39, 36, 32, '#457650'); rect(x - 13, y - 35, 14, 8, '#608d60');
        } else {
          rect(x - e.w * 20, y - e.h * 20 + 7, e.w * 40, e.h * 40, colors.bg); rect(x - e.w * 20, y - e.h * 20, e.w * 40, e.h * 40 - 4, colors.wall); rect(x - e.w * 20 + 4, y - e.h * 20 + 4, e.w * 40 - 8, 4, colors.grid);
        }
        continue;
      }
      if (e.type === 'coin') {
        const bob = Math.sin(t * 3 + e.x) * 3;
        ctx.save(); ctx.translate(x, y + bob); ctx.shadowColor = colors.gem; ctx.shadowBlur = 16;
        ctx.fillStyle = colors.gem; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, -2); ctx.lineTo(0, 10); ctx.lineTo(-7, -2); ctx.closePath(); ctx.fill();
        rect(-2, -6, 3, 7, '#fff5e9'); ctx.restore(); continue;
      }
      if (e.type === 'bullet') { ctx.save(); ctx.shadowColor = colors.accent; ctx.shadowBlur = 14; rect(x - 3, y - 3, 6, 6, colors.accent); ctx.restore(); continue; }
      // Hand-drawn pixel characters: explorer, pilot, diver, and themed enemies.
      ctx.fillStyle = '#00000035'; ctx.beginPath(); ctx.ellipse(x, y + 14, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
      if (e.type === 'player') {
        if (state.invulnerable > 0 && Math.floor(t * 14) % 2) continue;
        const stride = Math.sin(t * 10) * 2;
        rect(x - 8, y + 6, 6, 9 + stride, '#283b42'); rect(x + 2, y + 6, 6, 9 - stride, '#283b42');
        rect(x - 10, y - 4, 20, 14, spec.theme === 'space' ? '#91becd' : spec.theme === 'ocean' ? '#e8c771' : '#b7b0d6');
        rect(x - 13, y - 1, 4, 9, '#e5be95'); rect(x + 9, y - 1, 4, 9, '#e5be95');
        rect(x - 8, y - 17, 16, 15, '#e5be95'); rect(x - 10, y - 20, 20, 8, colors.accent); rect(x - 13, y - 14, 26, 4, colors.accent);
        rect(x - 4, y - 9, 3, 3, '#24313b'); rect(x + 3, y - 9, 3, 3, '#24313b');
        if (spec.theme === 'space' || spec.theme === 'ocean') rect(x - 7, y - 12, 14, 5, '#294a65');
        if (state.dashCooldown <= 0) { ctx.strokeStyle = `${colors.accent}55`; ctx.beginPath(); ctx.ellipse(x, y + 13, 17, 7, 0, 0, Math.PI * 2); ctx.stroke(); }
      } else {
        const bob = Math.sin(t * 4 + e.x) * 3;
        rect(x - 11, y - 8 + bob, 22, 19, colors.enemy); rect(x - 7, y - 14 + bob, 14, 7, colors.enemy); rect(x - 14, y - 2 + bob, 5, 9, colors.enemy); rect(x + 9, y - 2 + bob, 5, 9, colors.enemy);
        rect(x - 6, y - 5 + bob, 4, 5, '#382836'); rect(x + 3, y - 5 + bob, 4, 5, '#382836');
        if (spec.theme === 'space' || spec.theme === 'neon') rect(x - 5, y + 5 + bob, 10, 3, '#fff0c7');
      }
    }
    for (const effect of state.effects) { ctx.globalAlpha = Math.min(1, effect.life * 2); rect(effect.x * 40, effect.y * 40 - (1 - effect.life) * 16, 4, 4, effect.color); } ctx.globalAlpha = 1;
    // In-game HUD stays present in screenshots and standalone exports.
    rect(16, 16, 170, 42, '#0c171ee0'); ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = colors.accent;
    ctx.fillText('♥'.repeat(Math.max(0, state.health)), 28, 42);
    ctx.textAlign = 'right'; ctx.fillText(`${state.score.toString().padStart(4, '0')}`, 174, 42);
    rect(714, 16, 230, 42, '#0c171ee0'); ctx.fillStyle = '#d4e4df'; ctx.fillText(`${state.collected}/${spec.collectibleCount} GEMS  ·  ${Math.max(0, Math.ceil(spec.timeLimit - t))}s`, 930, 42);
    if (state.outcome !== 'playing') {
      rect(0, 0, 960, 560, '#08121dcc'); ctx.textAlign = 'center'; ctx.fillStyle = colors.accent; ctx.font = 'bold 40px Georgia'; ctx.fillText(state.outcome === 'won' ? 'A little legend is born.' : 'Every legend takes practice.', 480, 248);
      ctx.fillStyle = '#e0e5e1'; ctx.font = '16px monospace'; ctx.fillText(`Score ${state.score}  ·  Press R to play again`, 480, 292);
    }
    ctx.restore();
  }
  reset();
  return { get state() { return state; }, spec, colors, step, reset, draw,
    snapshot: () => JSON.parse(JSON.stringify(state)) as WorldState,
    restore: (snapshot: WorldState) => { state = JSON.parse(JSON.stringify(snapshot)) as WorldState; },
  };
}
export type GameEngine = ReturnType<typeof createGameEngine>;
