export const WORLD_WIDTH = 9000;
export const SCALE = 50; // Pixels per metre; seconds are real simulation seconds.
export const landmarks = [
  { x: 350, name: 'BASE CAMP', note: 'Push a sphere. Mass changes how it moves.' },
  { x: 2250, name: 'ICE FIELDS', note: 'Low friction lets momentum carry you.' },
  { x: 4400, name: 'SPRING VALLEY', note: 'Elastic ground returns collision energy.' },
  { x: 6400, name: 'HIGH RIDGE', note: 'Turn height into speed on the downhill.' },
  { x: 8500, name: 'THE OBSERVATORY', note: 'A world in motion. Keep experimenting.' },
];
export function terrain(x: number): number { return 100 + Math.sin(x / 510) * 72 + Math.sin(x / 187) * 22 + 115 * Math.exp(-(((x - 6350) / 650) ** 2)); }
export function slope(x: number): number { return (terrain(x + 0.5) - terrain(x - 0.5)); }
export interface Body { id: number; x: number; y: number; vx: number; vy: number; r: number; mass: number; bounce: number; angle: number; grounded: boolean; material: 'player' | 'rubber' | 'stone' | 'wood' }
export interface PhysicsInput { move: number; jump?: boolean; grab?: boolean; throw?: boolean; spawn?: boolean }
export class PhysicsWorld {
  bodies: Body[] = [];
  gravity = 9.81;
  elapsed = 0;
  held = -1;
  visited = new Set<number>();
  facing = 1;
  private nextId = 1;
  private accumulator = 0;
  constructor() {
    this.bodies.push({ id: 0, x: 350, y: terrain(350) + 23, vx: 0, vy: 0, r: 23, mass: 2, bounce: 0, angle: 0, grounded: true, material: 'player' });
    for (let i = 0; i < 36; i++) this.spawn(480 + i * 230, i % 3);
  }
  get player(): Body { return this.bodies[0]!; }
  spawn(x = this.player.x + this.facing * 85, kind = this.nextId % 3): void {
    if (this.bodies.length >= 64) return;
    x = Math.max(40, Math.min(WORLD_WIDTH - 40, x));
    const material = (['rubber', 'stone', 'wood'] as const)[kind]!;
    const r = material === 'stone' ? 30 : material === 'wood' ? 23 : 19;
    this.bodies.push({ id: this.nextId++, x, y: terrain(x) + r + 100, vx: 0, vy: 0, r, mass: material === 'stone' ? 5 : material === 'wood' ? 1.5 : 0.65, bounce: material === 'rubber' ? 0.88 : 0.15, angle: 0, grounded: false, material });
  }
  step(seconds: number, input: PhysicsInput): void {
    const p = this.player;
    if (input.move) this.facing = Math.sign(input.move);
    if (input.spawn) this.spawn();
    if (input.grab) {
      if (this.held >= 0) this.held = -1;
      else {
        const nearest = this.bodies.slice(1).filter(b => Math.hypot(b.x - p.x, b.y - p.y) < 115).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        if (nearest) this.held = nearest.id;
      }
    }
    if (input.throw && this.held >= 0) {
      const b = this.bodies.find(b => b.id === this.held)!;
      // Equal and opposite impulse gives heavy throws a noticeable recoil.
      const impulse = 390;
      b.vx += this.facing * impulse / b.mass; b.vy += impulse / b.mass;
      p.vx -= this.facing * impulse / p.mass; p.vy -= impulse / p.mass;
      this.held = -1;
    }
    if (input.jump && p.grounded) { p.vy = 335; p.grounded = false; }
    this.accumulator += Math.min(seconds, 0.1);
    const dt = 1 / 120;
    while (this.accumulator >= dt) {
      this.accumulator -= dt; this.elapsed += dt;
      p.vx += Math.max(-1, Math.min(1, input.move)) * (p.grounded ? 630 : 230) * dt;
      p.vx = Math.max(-440, Math.min(440, p.vx));
      for (const b of this.bodies) {
        if (b.id === this.held) {
          const fx = (p.x + this.facing * 64 - b.x) * 35 - (b.vx - p.vx) * 8;
          const fy = (p.y + 45 - b.y) * 35 - (b.vy - p.vy) * 8;
          b.vx += fx / b.mass * dt; b.vy += fy / b.mass * dt;
          p.vx -= fx / p.mass * dt; p.vy -= fy / p.mass * dt;
        }
        b.vy -= this.gravity * SCALE * dt;
        b.vx *= Math.exp(-0.035 * dt); b.vy *= Math.exp(-0.035 * dt);
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * b.bounce; }
        if (b.x > WORLD_WIDTH - b.r) { b.x = WORLD_WIDTH - b.r; b.vx = -Math.abs(b.vx) * b.bounce; }
        b.grounded = false;
        const floor = terrain(b.x) + b.r;
        if (b.y <= floor) {
          b.y = floor; b.grounded = true;
          const s = slope(b.x), length = Math.hypot(s, 1), nx = -s / length, ny = 1 / length;
          const vn = b.vx * nx + b.vy * ny;
          const spring = b.x > 4050 && b.x < 4700;
          const restitution = spring ? 0.97 : b.bounce;
          if (vn < 0) { const impulse = -(1 + (Math.abs(vn) > 40 ? restitution : 0)) * vn; b.vx += impulse * nx; b.vy += impulse * ny; }
          const tx = ny, ty = -nx, vt = b.vx * tx + b.vy * ty;
          const mu = b.x > 1800 && b.x < 3000 ? 0.008 : b.material === 'player' ? (input.move ? 0.32 : 0.8) : 0.06;
          const friction = Math.min(Math.abs(vt), mu * this.gravity * SCALE * dt);
          b.vx -= Math.sign(vt) * friction * tx; b.vy -= Math.sign(vt) * friction * ty;
        }
        b.angle += b.vx / b.r * dt;
      }
      for (let i = 0; i < this.bodies.length; i++) for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i]!, b = this.bodies[j]!;
        const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy), overlap = a.r + b.r - distance;
        if (overlap <= 0) continue;
        const nx = distance ? dx / distance : 1, ny = distance ? dy / distance : 0, inv = 1 / a.mass + 1 / b.mass;
        a.x -= nx * overlap / a.mass / inv; a.y -= ny * overlap / a.mass / inv;
        b.x += nx * overlap / b.mass / inv; b.y += ny * overlap / b.mass / inv;
        const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (relative < 0) {
          const impulse = -(1 + Math.min(a.bounce, b.bounce)) * relative / inv;
          a.vx -= impulse * nx / a.mass; a.vy -= impulse * ny / a.mass;
          b.vx += impulse * nx / b.mass; b.vy += impulse * ny / b.mass;
        }
      }
      for (let i = 0; i < landmarks.length; i++) if (Math.abs(p.x - landmarks[i]!.x) < 180) this.visited.add(i);
    }
  }
}
