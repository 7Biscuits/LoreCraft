import { mainContext, mainCanvasSize, keyWasPressed, keyIsDown, mouseWasPressed, mouseIsDown, mousePosScreen } from 'littlejsengine';
import type { EngineObject } from 'littlejsengine';
import type { GameContext, GameFrame, GameModule } from '../contract';
import { RacingSimulation } from './simulation';

export class EndlessRacerGame implements GameModule {
  readonly id = 'endless-racer';
  readonly title = 'Endless Racer';
  private context?: GameContext;
  private sim = new RacingSimulation();
  private best = 0;
  private paused = false;
  private crashTime = 0;
  init(context: GameContext): void {
    this.context = context;
    try { this.best = Number(localStorage.getItem('endless-racer-best')) || 0; } catch { /* Optional storage. */ }
    this.reset();
  }
  reset(): void {
    this.sim = new RacingSimulation(); this.paused = false; this.crashTime = 0;
    this.context?.setScore(0);
    const result = this.context?.createEntity({ id: 'race-car', type: 'player', dimension: '2d', position: { x: 480, y: 455 }, properties: { size: { x: 44, y: 76 } } });
    if (result && !result.ok) throw new Error(result.error.message);
    const car = this.context?.getObject<EngineObject>('race-car');
    if (car) car.render = () => {};
  }
  update(frame: GameFrame): void {
    if (frame.restart) { this.context?.runtime.resetGame(); return; }
    const action = keyWasPressed('Space') || keyWasPressed('Enter') || mouseWasPressed(0);
    if (this.sim.phase === 'ready') { if (action) this.sim.start(); return; }
    if (this.sim.phase === 'crashed') {
      this.crashTime += frame.deltaSeconds;
      if (action && this.crashTime > 0.4) { this.context?.runtime.resetGame(); this.sim.start(); }
      return;
    }
    if (keyWasPressed('KeyP')) this.paused = !this.paused;
    if (this.paused) return;
    let steer = frame.movement.x;
    if (mouseIsDown(0)) {
      const scale = Math.min(mainCanvasSize.x / 960, mainCanvasSize.y / 600);
      const pointerX = (mousePosScreen.x - (mainCanvasSize.x - 960 * scale) / 2) / scale;
      steer = pointerX < 480 ? -1 : 1;
    }
    this.sim.step(frame.deltaSeconds, steer, frame.movement.y < 0 || keyIsDown('Space'));
    this.context?.setScore(Math.floor(this.sim.distance));
    const car = this.context?.getObject<EngineObject>('race-car');
    if (car) car.pos.x = this.sim.x;
    if (Math.floor(this.sim.distance) > this.best) {
      this.best = Math.floor(this.sim.distance);
      try { localStorage.setItem('endless-racer-best', String(this.best)); } catch { /* Optional storage. */ }
    }
  }
  destroy(): void { this.context = undefined; }
  getState() { return { outcome: this.sim.phase, distance: Math.floor(this.sim.distance), speed: Math.round(this.sim.speed * 0.6), passed: this.sim.passed, best: this.best, paused: this.paused }; }
  render(): void {
    const c = mainContext; if (!c) return;
    const s = this.sim, offset = s.distance * 10;
    c.save(); c.fillStyle = '#122b2a'; c.fillRect(0, 0, mainCanvasSize.x, mainCanvasSize.y);
    const scale = Math.min(mainCanvasSize.x / 960, mainCanvasSize.y / 600);
    c.translate((mainCanvasSize.x - 960 * scale) / 2, (mainCanvasSize.y - 600 * scale) / 2); c.scale(scale, scale);
    c.fillStyle = '#172c2b'; c.fillRect(0, 0, 960, 600);
    c.fillStyle = '#244c3e'; c.fillRect(278, 0, 404, 600);
    c.fillStyle = '#303a43'; c.fillRect(315, 0, 330, 600);
    for (let i = -1; i < 17; i++) {
      const y = i * 44 + offset % 44;
      c.fillStyle = i % 2 ? '#edb878' : '#fff0cb';
      c.fillRect(303, y, 12, 44); c.fillRect(645, y, 12, 44);
    }
    c.fillStyle = '#e6dcb2';
    for (const x of [425, 535]) for (let i = -1; i < 10; i++) c.fillRect(x - 2, i * 85 + offset % 85, 4, 42);
    for (let i = -1; i < 8; i++) {
      const y = i * 115 + offset * 0.8 % 115;
      for (const x of [280, 680]) {
        c.fillStyle = '#102d28'; c.beginPath(); c.ellipse(x, y + 7, 22, 28, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#40735a'; c.beginPath(); c.arc(x - 3, y - 3, 18, 0, Math.PI * 2); c.fill();
      }
    }
    const text = (value: string, x: number, y: number, size: number, color = '#fff0cb', align: CanvasTextAlign = 'left') => {
      c.font = `700 ${size}px system-ui, sans-serif`; c.textAlign = align; c.fillStyle = color; c.fillText(value, x, y);
    };
    text('OPEN ROAD / 01', 32, 45, 12, '#e6ad73');
    text('ENDLESS', 30, 99, 35); text('RACER', 30, 139, 35);
    text('Chase the horizon.', 32, 172, 15, '#9ab7a9');
    text('DISTANCE', 32, 244, 12, '#9ab7a9'); text(`${Math.floor(s.distance)} m`, 30, 286, 35);
    text('PERSONAL BEST', 32, 339, 12, '#9ab7a9'); text(`${this.best} m`, 32, 371, 24);
    text('← →  /  A D   STEER', 32, 488, 13);
    text('↓ / SPACE   BRAKE', 32, 518, 13);
    text('P   PAUSE     R   RESTART', 32, 548, 12, '#9ab7a9');
    text('CRUISE CONTROL', 712, 45, 12, '#e6ad73');
    text(String(Math.round(s.speed * 0.6)), 710, 117, 64); text('KM/H', 714, 145, 13, '#9ab7a9');
    text('CARS PASSED', 714, 231, 12, '#9ab7a9'); text(String(s.passed).padStart(2, '0'), 710, 277, 38);
    text('STAY SHARP.', 714, 469, 18); text('The road never ends.', 714, 497, 13, '#9ab7a9');
    text('Hold left / right side', 714, 547, 13, '#9ab7a9'); text('to steer on touch.', 714, 568, 13, '#9ab7a9');
    const drawCar = (x: number, y: number, color: string, player = false) => {
      c.save(); c.translate(x, y);
      c.fillStyle = '#0005'; c.beginPath(); c.roundRect(-24, -38, 53, 86, 12); c.fill();
      c.fillStyle = '#101e25'; for (const tx of [-27, 20]) for (const ty of [-25, 21]) c.fillRect(tx, ty, 7, 18);
      c.fillStyle = color; c.beginPath(); c.roundRect(-23, -43, 46, 86, 11); c.fill();
      c.fillStyle = '#1b3541'; c.beginPath(); c.roundRect(-17, -22, 34, 24, 5); c.fill();
      c.fillStyle = '#86bbc4'; c.fillRect(-14, -19, 28, 5);
      c.fillStyle = '#1b3541'; c.fillRect(-15, 22, 30, 11);
      c.fillStyle = '#fff5bc'; c.fillRect(-18, -38, 9, 5); c.fillRect(9, -38, 9, 5);
      c.fillStyle = '#f06e5d'; c.fillRect(-18, 35, 8, 4); c.fillRect(10, 35, 8, 4);
      if (player) { c.fillStyle = '#fff0cb'; c.fillRect(-4, 3, 8, 16); }
      c.restore();
    };
    const colors = ['#d8775b', '#78aeb5', '#dcc584', '#a799bd'];
    for (const car of s.traffic) drawCar(car.x, car.y, colors[car.color]!);
    drawCar(s.x, 455, '#efb45e', true);
    if (s.phase !== 'racing' || this.paused) {
      c.fillStyle = '#112324b8'; c.fillRect(300, 0, 360, 600);
      c.fillStyle = '#f8efd9'; c.beginPath(); c.roundRect(325, 165, 310, 242, 18); c.fill();
      const title = this.paused ? 'PIT STOP' : s.phase === 'crashed' ? 'END OF THE ROAD' : 'READY TO ROLL?';
      text(title, 480, 209, 23, '#253d36', 'center');
      text(s.phase === 'crashed' ? `${Math.floor(s.distance)} m  ·  ${s.passed} cars passed` : 'Weave through traffic.', 480, 251, 16, '#52695a', 'center');
      text(s.phase === 'crashed' ? 'A new record awaits.' : 'See how far you can go.', 480, 278, 15, '#52695a', 'center');
      c.fillStyle = '#efb45e'; c.beginPath(); c.roundRect(347, 306, 266, 54, 27); c.fill();
      text(this.paused ? 'P TO RESUME' : s.phase === 'crashed' ? 'SPACE / TAP TO RETRY' : 'SPACE / TAP TO START', 480, 340, 16, '#253d36', 'center');
      text('Steer with arrows or A / D', 480, 386, 13, '#52695a', 'center');
    }
    c.restore();
  }
}
export const endlessRacerGame = new EndlessRacerGame();
