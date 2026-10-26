export const buildings = [
  { x: 4, y: 3, w: 5, h: 4, roof: '#c95f55', name: 'HOME' },
  { x: 15, y: 3, w: 5, h: 4, roof: '#6083b4', name: 'NEIGHBOR' },
  { x: 14, y: 11, w: 7, h: 5, roof: '#ac784d', name: 'FIELD LAB' },
];
export const pond = { x: 3, y: 12, w: 5, h: 4 };
export function blocked(x: number, y: number): boolean {
  return x < 2 || x > 21 || y < 2 || y > 16
    || buildings.some(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)
    || (x >= pond.x && x < pond.x + pond.w && y >= pond.y && y < pond.y + pond.h)
    || (x === 10 && y === 8) || (x === 12 && y === 14);
}
export class TownWalker {
  x = 11; y = 9;
  fromX = 11; fromY = 9;
  progress = 1;
  direction: 'up' | 'down' | 'left' | 'right' = 'down';
  steps = 0;
  update(dt: number, dx: number, dy: number): void {
    if (this.progress < 1) { this.progress = Math.min(1, this.progress + Math.max(0, dt) / 0.14); return; }
    dx = Math.sign(dx); dy = Math.sign(dy);
    if (dx) dy = 0;
    if (!dx && !dy) return;
    this.direction = dx ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up';
    if (blocked(this.x + dx, this.y + dy)) return;
    this.fromX = this.x; this.fromY = this.y;
    this.x += dx; this.y += dy; this.progress = 0; this.steps++;
  }
  get renderX() { return this.fromX + (this.x - this.fromX) * this.progress; }
  get renderY() { return this.fromY + (this.y - this.fromY) * this.progress; }
}
