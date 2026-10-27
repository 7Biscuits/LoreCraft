import { mainContext, mainCanvasSize, keyWasPressed, mouseWasPressed } from 'littlejsengine';
import type { EngineObject } from 'littlejsengine';
import type { GameContext, GameFrame, GameModule } from '../contract';
import { PongSimulation } from './simulation';

class SimplePong implements GameModule {
  readonly id = 'simple-pong';
  readonly title = 'Simple Pong';
  private context?: GameContext;
  private game = new PongSimulation();
  private paused = false;

  init(context: GameContext): void { this.context = context; this.reset(); }
  reset(): void {
    this.game = new PongSimulation(); this.paused = false;
    this.context?.setScore(0);
    for (const [id, type, x, y, w, h] of [
      ['player-paddle', 'player', 64, 280, 16, 92],
      ['computer-paddle', 'enemy', 896, 280, 16, 92],
      ['ball', 'obstacle', 480, 280, 14, 14],
    ] as const) {
      const result = this.context?.createEntity({ id, type, dimension: '2d', position: { x, y }, properties: { size: { x: w, y: h } } });
      if (result && !result.ok) throw new Error(result.error.message);
      const object = this.context?.getObject<EngineObject>(id);
      if (object) object.render = () => {};
    }
  }
  update(frame: GameFrame): void {
    if (frame.restart) { this.context?.runtime.resetGame(); return; }
    if (keyWasPressed('KeyP') && this.game.phase === 'playing') this.paused = !this.paused;
    if (keyWasPressed('Space') || mouseWasPressed(0)) {
      if (this.game.phase === 'won' || this.game.phase === 'lost') this.context?.runtime.resetGame();
      this.game.start();
    }
    if (!this.paused) this.game.step(frame.deltaSeconds, frame.movement.y);
    this.context?.setScore(this.game.playerScore);
    for (const [id, x, y] of [['player-paddle', 64, this.game.playerY], ['computer-paddle', 896, this.game.computerY], ['ball', this.game.ball.x, this.game.ball.y]] as const) {
      const object = this.context?.getObject<EngineObject>(id);
      if (object) { object.pos.x = x; object.pos.y = y; }
    }
  }
  getState() {
    return { outcome: this.game.phase, paused: this.paused, playerScore: this.game.playerScore, computerScore: this.game.computerScore, targetScore: 7, rallyHits: this.game.hits, ball: { ...this.game.ball } };
  }
  destroy(): void { this.context = undefined; }
  render(): void {
    const c = mainContext;
    if (!c) return;
    const g = this.game;
    c.save(); c.fillStyle = '#090e19'; c.fillRect(0, 0, mainCanvasSize.x, mainCanvasSize.y);
    const scale = Math.min(mainCanvasSize.x / 960, mainCanvasSize.y / 560);
    c.translate((mainCanvasSize.x - 960 * scale) / 2, (mainCanvasSize.y - 560 * scale) / 2); c.scale(scale, scale);
    const text = (s: string, x: number, y: number, size: number, color = '#e9f1ff') => {
      c.fillStyle = color; c.font = `600 ${size}px monospace`; c.textAlign = 'center'; c.fillText(s, x, y);
    };
    text('P O N G', 102, 48, 25);
    text('FIRST TO 7', 840, 46, 14, '#8c9bb3');
    c.fillStyle = '#0e1728'; c.fillRect(32, 80, 896, 400);
    c.strokeStyle = '#334157'; c.lineWidth = 2; c.strokeRect(32, 80, 896, 400);
    c.setLineDash([8, 12]); c.beginPath(); c.moveTo(480, 80); c.lineTo(480, 480); c.stroke(); c.setLineDash([]);
    text(String(g.playerScore), 412, 55, 36, '#68e5e0'); text(String(g.computerScore), 548, 55, 36, '#ffbb79');
    for (const [x, y, color] of [[64, g.playerY, '#68e5e0'], [896, g.computerY, '#ffbb79']] as const) {
      c.fillStyle = color; c.shadowColor = color; c.shadowBlur = 16;
      c.fillRect(x - 8, y - 46, 16, 92);
    }
    c.fillStyle = '#fff'; c.shadowColor = '#a5dbff'; c.shadowBlur = 14;
    c.fillRect(g.ball.x - 7, g.ball.y - 7, 14, 14); c.shadowBlur = 0;
    text('YOU', 90, 510, 13, '#68e5e0'); text('COMPUTER', 864, 510, 13, '#ffbb79');
    text('↑ ↓ / W S  move     SPACE / CLICK  start     P  pause     R  restart', 480, 543, 13, '#8c9bb3');
    if (g.phase !== 'playing' || this.paused) {
      c.fillStyle = '#090e19e8'; c.fillRect(230, 185, 500, 180);
      text(this.paused ? 'PAUSED' : g.phase === 'ready' ? 'READY TO RALLY?' : g.phase === 'won' ? 'YOU WIN!' : 'COMPUTER WINS', 480, 248, 30);
      text(this.paused ? 'Press P to resume' : g.phase === 'ready' ? 'Beat the computer. First to seven.' : `${g.playerScore} — ${g.computerScore}   ·   Play again?`, 480, 290, 16, '#8c9bb3');
      if (!this.paused) text('PRESS SPACE OR CLICK', 480, 333, 16, '#68e5e0');
    } else if (g.serveDelay > 0) text('GET READY', 480, 230, 18, '#8c9bb3');
    c.restore();
  }
}
export const simplePongGame = new SimplePong();
