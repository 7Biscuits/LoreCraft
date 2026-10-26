export interface Pipe { x: number; gap: number; scored: boolean }
export class FlappySimulation {
  y = 270;
  velocity = 0;
  score = 0;
  elapsed = 0;
  phase: 'ready' | 'playing' | 'lost' = 'ready';
  pipes: Pipe[] = [];
  private nextPipe = 0;
  flap(): void {
    if (this.phase === 'lost') return;
    this.phase = 'playing';
    this.velocity = -330;
  }
  step(seconds: number): void {
    if (this.phase !== 'playing') return;
    // Small substeps keep collision reliable even when a frame is delayed.
    let remaining = Math.min(Math.max(seconds, 0), 0.25);
    while (remaining > 0 && this.phase === 'playing') {
      const dt = Math.min(remaining, 1 / 120);
      remaining -= dt;
      this.elapsed += dt;
      this.velocity += 980 * dt;
      this.y += this.velocity * dt;
      if (!this.pipes.length || this.pipes[this.pipes.length - 1]!.x < 650) {
        this.pipes.push({ x: 1000, gap: 190 + (Math.sin(++this.nextPipe * 2.4) + 1) * 90, scored: false });
      }
      const speed = 190 + Math.min(this.score * 3, 65);
      for (const pipe of this.pipes) {
        pipe.x -= speed * dt;
        if (Math.abs(pipe.x - 260) < 54 && (this.y - 16 < pipe.gap - 94 || this.y + 16 > pipe.gap + 94)) this.phase = 'lost';
        if (!pipe.scored && pipe.x + 38 < 242 && this.phase === 'playing') { pipe.scored = true; this.score++; }
      }
      this.pipes = this.pipes.filter(pipe => pipe.x > -80);
      if (this.y < 18 || this.y > 486) this.phase = 'lost';
    }
  }
}
