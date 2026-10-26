import { mainContext, mainCanvas, setCanvasFixedSize, vec2 } from 'littlejsengine';
import type { EngineObject } from 'littlejsengine';
import type { GameContext, GameFrame, GameModule } from '../games/contract';
import { createGameEngine } from './engine';
import type { GameEngine, GameInput, WorldEntity, WorldState } from './engine';
import type { GameSpec } from './spec';

/** Generated scenes use the same authored host, registry, and bridge as source-authored games. */
export class GeneratedGame implements GameModule {
  readonly id: string;
  readonly title: string;
  readonly engine: GameEngine;
  private context?: GameContext;
  private tracked = new Set<string>();
  input: GameInput = { x: 0, y: 0 };
  onFrame?: () => void;
  constructor(readonly spec: GameSpec, id = 'generated-game') { this.id = id; this.title = spec.title; this.engine = createGameEngine(spec); }
  init(context: GameContext): void { this.context = context; setCanvasFixedSize(vec2(960, 560)); this.reset(); }
  update(frame: GameFrame): void {
    if (frame.restart) { this.context?.runtime.resetGame(); return; }
    // Reconcile external CRUD/inspector edits before advancing simulation.
    const live = this.context?.registry.list() ?? [];
    const ids = new Set(live.map((e) => e.id));
    this.engine.state.entities = this.engine.state.entities.filter((e) => e.type === 'bullet' || !this.tracked.has(e.id) || ids.has(e.id));
    for (const registered of live) {
      const pos = registered.getPosition(), size = registered.getSize();
      let e = this.engine.state.entities.find((v) => v.id === registered.id);
      if (!e) { e = { id: registered.id, type: registered.type, x: pos.x, y: pos.y, w: size.x, h: size.y, speed: registered.getSpeed(), hp: 1, vx: 0, vy: 0 }; this.engine.state.entities.push(e); }
      e.x = pos.x; e.y = pos.y; e.w = size.x; e.h = size.y; e.speed = registered.getSpeed();
    }
    const input = { ...this.input, x: this.input.x || frame.movement.x, y: this.input.y || -frame.movement.y };
    this.engine.step(input, frame.deltaSeconds); this.sync(); this.onFrame?.();
  }
  render(): void { this.engine.draw(mainContext, mainCanvas.width, mainCanvas.height); }
  reset(): void { this.tracked.clear(); this.engine.reset(); this.sync(); }
  destroy(): void { this.context = undefined; this.tracked.clear(); this.onFrame = undefined; }
  getState() { const s = this.engine.state; return { outcome: s.outcome, health: s.health, collected: s.collected, kills: s.kills, elapsed: s.elapsed, tick: s.tick, genre: this.spec.genre, theme: this.spec.theme }; }
  reconcile(): void { this.sync(); }
  restore(snapshot: WorldState): void {
    for (const entity of this.context?.registry.list() ?? []) this.context!.runtime.deleteEntity(entity.id);
    this.engine.restore(snapshot); this.sync();
  }
  private sync(): void {
    const context = this.context; if (!context) return;
    const entities = this.engine.state.entities.filter((e) => e.type !== 'bullet');
    const ids = new Set(entities.map((e) => e.id));
    for (const id of this.tracked) if (!ids.has(id)) context.runtime.deleteEntity(id);
    for (const e of entities) {
      if (!context.registry.get(e.id).ok) this.create(e);
      else { context.runtime.setEntityPosition(e.id, { x: e.x, y: e.y }); context.runtime.setEntityProperties(e.id, { size: { x: e.w, y: e.h }, speed: e.speed }); }
    }
    this.tracked = ids; context.setScore(this.engine.state.score);
  }
  private create(e: WorldEntity): void {
    if (e.type === 'bullet') return;
    const result = this.context!.createEntity({ id: e.id, type: e.type, dimension: '2d', position: { x: e.x, y: e.y }, properties: { size: { x: e.w, y: e.h }, speed: e.speed } });
    if (!result.ok) throw new Error(result.error.message);
    // Scene rendering is shared with standalone export; live objects remain registry-backed.
    const object = this.context!.getObject<EngineObject>(e.id)!; object.render = () => {};
  }
}
