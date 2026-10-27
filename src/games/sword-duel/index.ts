import { mainContext, mainCanvasSize, keyIsDown, keyWasPressed, mouseWasPressed } from 'littlejsengine';
import type { EngineObject } from 'littlejsengine';
import type { GameContext, GameFrame, GameModule } from '../contract';
import { SwordMatch } from './combat';
import type { Input } from './combat';
import { renderMatch } from './render';

class SwordDuel implements GameModule {
  readonly id = 'sword-duel'; readonly title = 'Sword Duel';
  private context?: GameContext;
  private match = new SwordMatch();
  private blur = () => { if (this.match.phase === 'fight') this.match.paused = true; };
  init(context: GameContext): void { this.context = context; window.addEventListener('blur', this.blur); this.reset(); }
  reset(): void {
    this.match = new SwordMatch(); this.context?.setScore(0);
    for (const [i, f] of this.match.fighters.entries()) {
      const id = `fighter-${i + 1}`;
      const result = this.context?.createEntity({ id, type: 'player', dimension: '2d', position: { x: f.x, y: f.y }, properties: { size: { x: 46, y: 108 } } });
      if (result && !result.ok) throw new Error(result.error.message);
      const object = this.context?.getObject<EngineObject>(id); if (object) object.render = () => {};
    }
  }
  update(frame: GameFrame): void {
    if (frame.restart) { this.context?.runtime.resetGame(); return; }
    if (keyWasPressed('Enter') || mouseWasPressed(0)) {
      if (this.match.phase === 'matchOver') this.context?.runtime.resetGame();
      this.match.start();
    }
    if (keyWasPressed('KeyP') || keyWasPressed('Escape')) this.match.paused = !this.match.paused;
    const sample = (left: string, right: string, jump: string, block: string, punch: string, kick: string, sword: string): Input => ({
      move: Number(keyIsDown(right)) - Number(keyIsDown(left)), jump: keyWasPressed(jump), block: keyIsDown(block),
      attack: keyWasPressed(sword) ? 'sword' : keyWasPressed(kick) ? 'kick' : keyWasPressed(punch) ? 'punch' : undefined,
    });
    this.match.update(frame.deltaSeconds, [sample('KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyG', 'KeyH'), sample('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyJ', 'KeyK', 'KeyL')]);
    this.context?.setScore(this.match.fighters[0].wins);
    this.match.fighters.forEach((f, i) => { const o = this.context?.getObject<EngineObject>(`fighter-${i + 1}`); if (o) { o.pos.x = f.x; o.pos.y = f.y; } });
  }
  render(): void { if (mainContext) renderMatch(mainContext, mainCanvasSize.x, mainCanvasSize.y, this.match); }
  getState() { return { outcome: this.match.phase === 'matchOver' ? 'won' : 'playing', phase: this.match.phase, paused: this.match.paused, round: this.match.round, timer: this.match.timer, winner: this.match.winner < 0 ? '' : `Player ${this.match.winner + 1}`, fighters: this.match.fighters.map(f => ({ x: f.x, y: f.y, health: f.health, wins: f.wins, blocking: f.blocking, attack: f.attack?.kind ?? '' })) }; }
  destroy(): void { window.removeEventListener('blur', this.blur); this.context = undefined; }
}
export const swordDuelGame = new SwordDuel();
