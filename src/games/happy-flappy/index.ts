import { mainContext, mainCanvasSize, keyWasPressed, mouseWasPressed } from 'littlejsengine';
import type { EngineObject } from 'littlejsengine';
import type { GameContext, GameFrame, GameModule } from '../contract';
import { FlappySimulation } from './simulation';

export class HappyFlappyGame implements GameModule {
  readonly id = 'happy-flappy';
  readonly title = 'Happy Flappy';
  private context?: GameContext;
  private simulation = new FlappySimulation();
  private best = 0;
  private upHeld = false;
  private lostFor = 0;
  init(context: GameContext): void {
    this.context = context;
    try { this.best = Number(localStorage.getItem('happy-flappy-best')) || 0; } catch { /* Storage is optional. */ }
    this.reset();
  }
  reset(): void {
    this.simulation = new FlappySimulation();
    this.lostFor = 0;
    this.upHeld = false;
    this.context?.setScore(0);
    const result = this.context?.createEntity({ id: 'bird', type: 'player', dimension: '2d', position: { x: 260, y: 270 }, properties: { size: { x: 32, y: 32 } } });
    if (result && !result.ok) throw new Error(result.error.message);
    const bird = this.context?.getObject<EngineObject>('bird');
    if (bird) bird.render = () => {};
  }
  update(frame: GameFrame): void {
    const up = frame.movement.y > 0;
    const flap = keyWasPressed('Space') || mouseWasPressed(0) || (up && !this.upHeld);
    this.upHeld = up;
    if (frame.restart) { this.context?.runtime.resetGame(); return; }
    if (this.simulation.phase === 'lost') {
      this.lostFor += frame.deltaSeconds;
      if (flap && this.lostFor > 0.35) { this.context?.runtime.resetGame(); this.simulation.flap(); }
      return;
    }
    if (flap) this.simulation.flap();
    this.simulation.step(frame.deltaSeconds);
    this.context?.setScore(this.simulation.score);
    const bird = this.context?.getObject<EngineObject>('bird');
    if (bird) { bird.pos.x = 260; bird.pos.y = this.simulation.y; }
    if (this.simulation.score > this.best) {
      this.best = this.simulation.score;
      try { localStorage.setItem('happy-flappy-best', String(this.best)); } catch { /* Storage is optional. */ }
    }
  }
  getState() { return { outcome: this.simulation.phase, score: this.simulation.score, best: this.best, birdY: this.simulation.y, velocity: this.simulation.velocity }; }
  destroy(): void { this.context = undefined; }
  render(): void {
    const c = mainContext;
    if (!c) return;
    const s = this.simulation;
    c.save();
    c.fillStyle = '#d9f1ed'; c.fillRect(0, 0, mainCanvasSize.x, mainCanvasSize.y);
    const scale = Math.min(mainCanvasSize.x / 960, mainCanvasSize.y / 560);
    c.translate((mainCanvasSize.x - 960 * scale) / 2, (mainCanvasSize.y - 560 * scale) / 2);
    c.scale(scale, scale);
    const sky = c.createLinearGradient(0, 0, 0, 520);
    sky.addColorStop(0, '#b9e9ee'); sky.addColorStop(1, '#f4f6d9');
    c.fillStyle = sky; c.fillRect(0, 0, 960, 560);
    const ellipse = (x: number, y: number, rx: number, ry: number, color: string) => {
      c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
    };
    ellipse(810, 110, 45, 45, '#fff6c2');
    for (let i = 0; i < 6; i++) {
      const x = ((i * 225 + 80 - s.elapsed * 12) % 1320 + 1320) % 1320 - 130;
      const y = 135 + (i % 3) * 70;
      ellipse(x, y, 47, 15, '#ffffffb5'); ellipse(x + 22, y - 9, 25, 20, '#ffffffb5');
    }
    for (let i = 0; i < 8; i++) ellipse(i * 175 - (s.elapsed * 22 % 175), 508, 140, 80 + (i % 2) * 18, '#b1d6b7');
    for (const p of s.pipes) {
      const top = p.gap - 94, bottom = p.gap + 94;
      for (const [y, h] of [[0, top], [bottom, 508 - bottom]]) {
        c.fillStyle = '#326b57'; c.fillRect(p.x - 38, y!, 76, h!);
        c.fillStyle = '#77ba81'; c.fillRect(p.x - 33, y!, 62, h!);
        c.fillStyle = '#a1d59a'; c.fillRect(p.x - 27, y!, 11, h!);
      }
      for (const y of [top - 23, bottom]) {
        c.fillStyle = '#326b57'; c.fillRect(p.x - 45, y, 90, 23);
        c.fillStyle = '#83c48a'; c.fillRect(p.x - 40, y + 4, 80, 14);
      }
    }
    c.fillStyle = '#46745e'; c.fillRect(0, 508, 960, 9);
    c.fillStyle = '#e8d7a7'; c.fillRect(0, 517, 960, 43);
    c.fillStyle = '#d4bf8d';
    for (let i = 0; i < 45; i++) c.fillRect(i * 25 - (s.elapsed * 190 % 25), 528, 13, 4);
    const birdY = s.phase === 'ready' ? 270 + Math.sin(Date.now() / 220) * 5 : s.y;
    c.save(); c.translate(260, birdY); c.rotate(Math.max(-0.35, Math.min(0.9, s.velocity / 700)));
    ellipse(0, 0, 24, 19, '#b97337'); ellipse(0, -2, 22, 18, '#ffce58');
    ellipse(-8, 4 + Math.sin(s.elapsed * 28) * 3, 13, 8, '#efa940');
    ellipse(11, -8, 9, 10, '#fffdf2'); ellipse(14, -8, 3, 4, '#263f3c');
    c.fillStyle = '#eb7851'; c.beginPath(); c.moveTo(19, -1); c.lineTo(35, 4); c.lineTo(19, 9); c.fill();
    c.restore();
    const text = (value: string, x: number, y: number, size: number, color = '#244d45', align: CanvasTextAlign = 'center') => {
      c.fillStyle = color; c.font = `700 ${size}px system-ui, sans-serif`; c.textAlign = align; c.fillText(value, x, y);
    };
    text('HAPPY FLAPPY', 30, 40, 22, '#244d45', 'left');
    text(`BEST ${this.best}`, 930, 39, 16, '#244d45', 'right');
    if (s.phase === 'playing') {
      c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.font = '800 64px system-ui'; c.textAlign = 'center'; c.strokeText(String(s.score), 480, 98);
      text(String(s.score), 480, 98, 64);
    } else {
      c.fillStyle = '#fffef2ed'; c.beginPath(); c.roundRect(315, 175, 435, 220, 24); c.fill();
      text(s.phase === 'ready' ? 'Little wings. Big dreams.' : 'A happy little landing.', 532, 223, 26);
      text(s.phase === 'ready' ? 'Fly through the gaps. Keep the joy going.' : `SCORE  ${s.score}     ·     BEST  ${this.best}`, 532, 265, 18, '#5c7c6a');
      c.fillStyle = '#efb950'; c.beginPath(); c.roundRect(370, 292, 325, 54, 27); c.fill();
      text(s.phase === 'ready' ? 'SPACE / TAP TO FLAP' : 'SPACE / TAP TO TRY AGAIN', 532, 326, 17);
      text('Space · Click · Tap · ↑     /     R to restart', 532, 375, 13, '#5c7c6a');
    }
    c.restore();
  }
}
export const happyFlappyGame = new HappyFlappyGame();
