const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class PongSimulation {
  playerY = 280;
  computerY = 280;
  ball = { x: 480, y: 280, vx: -340, vy: 120 };
  playerScore = 0;
  computerScore = 0;
  phase: 'ready' | 'playing' | 'won' | 'lost' = 'ready';
  serveDelay = 0;
  hits = 0;

  start(): void { if (this.phase === 'ready') this.phase = 'playing'; }

  step(seconds: number, movement: number): void {
    if (this.phase !== 'playing') return;
    // Small substeps keep fast balls from tunneling through a paddle.
    const steps = Math.max(1, Math.ceil(seconds / (1 / 240)));
    const dt = seconds / steps;
    for (let i = 0; i < steps && this.phase === 'playing'; i++) {
      this.playerY = clamp(this.playerY - movement * 430 * dt, 126, 434);
      const target = this.ball.vx > 0 ? this.ball.y : 280;
      this.computerY = clamp(this.computerY + clamp(target - this.computerY, -245 * dt, 245 * dt), 126, 434);
      if (this.serveDelay > 0) { this.serveDelay -= dt; continue; }
      const b = this.ball;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < 87) { b.y = 174 - b.y; b.vy = Math.abs(b.vy); }
      if (b.y > 473) { b.y = 946 - b.y; b.vy = -Math.abs(b.vy); }
      const left = b.vx < 0 && b.x <= 79 && b.x >= 55 && Math.abs(b.y - this.playerY) <= 53;
      const right = b.vx > 0 && b.x >= 881 && b.x <= 905 && Math.abs(b.y - this.computerY) <= 53;
      if (left || right) {
        const offset = clamp((b.y - (left ? this.playerY : this.computerY)) / 46, -1, 1);
        const speed = Math.min(690, Math.hypot(b.vx, b.vy) * 1.06);
        const angle = offset * Math.PI / 3;
        b.vx = (left ? 1 : -1) * speed * Math.cos(angle);
        b.vy = speed * Math.sin(angle);
        b.x = left ? 79 : 881;
        this.hits++;
      }
      if (b.x < -10 || b.x > 970) {
        const playerPoint = b.x > 970;
        if (playerPoint) this.playerScore++; else this.computerScore++;
        if (this.playerScore === 7) this.phase = 'won';
        else if (this.computerScore === 7) this.phase = 'lost';
        this.ball = { x: 480, y: 280, vx: playerPoint ? 340 : -340, vy: (this.playerScore + this.computerScore) % 2 ? -120 : 120 };
        this.serveDelay = 0.85;
      }
    }
  }
}
