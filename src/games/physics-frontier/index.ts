import { mainContext, mainCanvasSize, keyIsDown, keyWasPressed } from 'littlejsengine';
import type { EngineObject } from 'littlejsengine';
import type { GameContext, GameFrame, GameModule } from '../contract';
import { PhysicsWorld, terrain } from './simulation';
import { renderWorld } from './render';

class PhysicsFrontier implements GameModule {
  readonly id = 'physics-frontier'; readonly title = 'Physics Frontier';
  private world = new PhysicsWorld();
  private context?: GameContext;
  private paused = false;
  private vectors = false;
  private camera = { x: 350, y: terrain(350) + 120 };
  init(context: GameContext): void { this.context = context; this.reset(); }
  reset(): void {
    this.world = new PhysicsWorld(); this.paused = false; this.camera = { x: 350, y: terrain(350) + 120 };
    this.context?.setScore(0);
    this.syncEntities();
  }
  private syncEntities(): void {
    for (const b of this.world.bodies) {
      const id = b.id === 0 ? 'explorer' : `body-${b.id}`;
      let object = this.context?.getObject<EngineObject>(id);
      if (!object) {
        const result = this.context?.createEntity({ id, type: b.id === 0 ? 'player' : 'obstacle', dimension: '2d', position: { x: b.x, y: b.y }, properties: { size: { x: b.r * 2, y: b.r * 2 } } });
        if (result && !result.ok) throw new Error(result.error.message);
        object = this.context?.getObject<EngineObject>(id); if (object) object.render = () => {};
      }
      if (object) { object.pos.x = b.x; object.pos.y = b.y; }
    }
  }
  update(frame: GameFrame): void {
    if (frame.restart) { this.context?.runtime.resetGame(); return; }
    if (keyWasPressed('KeyP')) this.paused = !this.paused;
    if (keyWasPressed('KeyV')) this.vectors = !this.vectors;
    if (keyWasPressed('Digit1')) this.world.gravity = 1.62;
    if (keyWasPressed('Digit2')) this.world.gravity = 9.81;
    if (keyWasPressed('Digit3')) this.world.gravity = 18;
    if (!this.paused) this.world.step(frame.deltaSeconds, { move: frame.movement.x,
      jump: keyWasPressed('Space') || keyWasPressed('KeyW') || keyWasPressed('ArrowUp'),
      grab: keyWasPressed('KeyE'), throw: keyWasPressed('KeyF'), spawn: keyWasPressed('KeyB') });
    const p = this.world.player, smooth = 1 - Math.exp(-5 * frame.deltaSeconds);
    this.camera.x += (p.x + (keyIsDown('ShiftLeft') ? p.vx * 0.5 : p.vx * 0.15) - this.camera.x) * smooth;
    this.camera.y += (Math.max(terrain(p.x) + 120, p.y + 70) - this.camera.y) * smooth;
    this.context?.setScore(this.world.visited.size); this.syncEntities();
  }
  render(): void { if (mainContext) renderWorld(mainContext, mainCanvasSize.x, mainCanvasSize.y, this.world, this.camera, this.vectors, this.paused); }
  getState() { const p = this.world.player; return { outcome: 'playing', gravity: this.world.gravity, explored: this.world.visited.size, landmarks: 5, elapsed: this.world.elapsed, heldBody: this.world.held, bodies: this.world.bodies.length, position: { x: p.x, y: p.y }, velocity: { x: p.vx, y: p.vy }, paused: this.paused }; }
  destroy(): void { this.context = undefined; }
}
export const physicsFrontierGame = new PhysicsFrontier();
