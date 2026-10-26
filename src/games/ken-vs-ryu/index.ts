import { mainContext, mainCanvasSize } from 'littlejsengine';
import type { EngineObject } from 'littlejsengine';
import type { GameContext, GameFrame, GameModule } from '../contract';
import { CombatMatch } from './combat';
import { DuelInput } from './input';
import { DuelAudio } from './audio';
import { renderDuel } from './render';

export class ArcadeDuelGame implements GameModule {
  readonly id = 'ken-vs-ryu';
  readonly title = 'Ken vs. Ryu — Arcade Duel';
  match = new CombatMatch();
  private context?: GameContext;
  private input?: DuelInput;
  private audio = new DuelAudio();
  init(context: GameContext): void {
    this.context = context;
    this.input = new DuelInput(() => { if (this.match.phase === 'fight' || this.match.phase === 'intro') this.match.paused = true; });
    this.input.attach(); this.reset();
  }
  reset(): void {
    this.match = new CombatMatch(); this.context?.setScore(0);
    for (const [i, id] of ['ken', 'ryu'].entries()) {
      const result = this.context?.createEntity({ id, type: 'player', dimension: '2d', position: { x: this.match.fighters[i]!.x, y: 532 }, properties: { size: { x: 46, y: 108 } } });
      if (result && !result.ok) throw new Error(result.error.message);
      const object = this.context?.getObject<EngineObject>(id); if (object) object.render = () => {};
    }
  }
  update(frame: GameFrame): void {
    const input = this.input?.sample(); if (!input) return;
    if (input.start) {
      this.audio.unlock();
      if (this.match.phase === 'title' || this.match.phase === 'matchOver') this.match.start();
    }
    if (input.pause && this.match.phase !== 'title' && this.match.phase !== 'matchOver') this.match.paused = !this.match.paused;
    if (input.restart && this.match.paused) this.match.start();
    this.match.update(frame.deltaSeconds, input.fighters);
    for (const sound of this.match.sounds) this.audio.play(sound);
    this.context?.setScore(this.match.fighters[0].wins);
    for (const [i, id] of ['ken', 'ryu'].entries()) {
      const object = this.context?.getObject<EngineObject>(id); if (object) { object.pos.x = this.match.fighters[i]!.x; object.pos.y = this.match.fighters[i]!.y; }
    }
  }
  render(): void { if (mainContext) renderDuel(mainContext, mainCanvasSize.x, mainCanvasSize.y, this.match); }
  getState() {
    return { outcome: this.match.phase === 'matchOver' ? 'won' : 'playing', phase: this.match.phase, paused: this.match.paused, round: this.match.round, timer: this.match.timer,
      fighters: this.match.fighters.map(f => ({ name: f.name, health: f.health, wins: f.wins, x: f.x, y: f.y, facing: f.face, attack: f.attack?.id ?? '', stun: f.stun, blockStun: f.guard, combo: f.combo, cooldown: f.cooldown })),
      winner: this.match.winner < 0 ? '' : this.match.fighters[this.match.winner]!.name, projectiles: this.match.projectiles.length };
  }
  destroy(): void { this.input?.detach(); this.audio.dispose(); this.context = undefined; }
}
export const arcadeDuelGame = new ArcadeDuelGame();
