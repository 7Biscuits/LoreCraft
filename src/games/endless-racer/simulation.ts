export interface TrafficCar { x: number; y: number; color: number }
export class RacingSimulation {
  phase: 'ready' | 'racing' | 'crashed' = 'ready';
  x = 480;
  distance = 0;
  passed = 0;
  speed = 200;
  traffic: TrafficCar[] = [];
  private spawnIn = 1;
  private row = 0;
  start(): void { if (this.phase === 'ready') this.phase = 'racing'; }
  step(seconds: number, steering: number, brake = false): void {
    if (this.phase !== 'racing') return;
    let remaining = Math.min(0.25, Math.max(0, seconds));
    while (remaining > 0 && this.phase === 'racing') {
      const dt = Math.min(remaining, 1 / 120); remaining -= dt;
      this.speed = (200 + Math.min(220, this.distance / 12)) * (brake ? 0.65 : 1);
      this.x = Math.max(341, Math.min(619, this.x + Math.max(-1, Math.min(1, steering)) * 330 * dt));
      this.distance += this.speed * dt / 10;
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        // Each wave leaves at least one lane open, with enough space to change lanes.
        const freeLane = (this.row * 7 + Math.floor(this.row / 3)) % 3;
        for (let lane = 0; lane < 3; lane++) {
          if (lane !== freeLane && (this.row % 3 === 2 || lane === (freeLane + 1) % 3)) {
            this.traffic.push({ x: 370 + lane * 110, y: -100, color: (this.row + lane) % 4 });
          }
        }
        this.row++;
        this.spawnIn = Math.max(1.4, 2.1 - this.distance / 4000);
      }
      for (const car of this.traffic) {
        const oldY = car.y; car.y += this.speed * dt;
        if (Math.abs(car.x - this.x) < 44 && Math.abs(car.y - 455) < 76) this.phase = 'crashed';
        if (oldY <= 545 && car.y > 545) this.passed++;
      }
      this.traffic = this.traffic.filter(car => car.y < 700);
    }
  }
}
