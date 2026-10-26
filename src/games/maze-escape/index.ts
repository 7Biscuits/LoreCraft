import { Color, EngineObject, drawRect, drawTextScreen, mainCanvasSize, setCameraScale, vec2 } from 'littlejsengine';
import type { EntityType, GameModuleState, ManagedEntity } from '../../runtime';
import type { GameContext, GameFrame, GameModule } from '../contract';
import { mazeConfig } from './config';

type Outcome = 'playing' | 'won' | 'lost';

const palette = {
  floor: new Color(0.1, 0.16, 0.26),
  key: new Color(1, 0.8, 0.2),
  exitLocked: new Color(0.7, 0.24, 0.34),
  exitOpen: new Color(0.32, 0.9, 0.54),
  text: new Color(0.94, 0.97, 1),
  ink: new Color(0.05, 0.08, 0.14),
};

/** A source-authored top-down game: collect a key, unlock the exit, and evade the sentinel. */
export class MazeEscapeGame implements GameModule {
  readonly id = 'maze-escape';
  readonly title = 'Maze Escape';
  private context?: GameContext;
  private hasKey = false;
  private outcome: Outcome = 'playing';

  init(context: GameContext): void {
    this.context = context;
    this.reset();
  }

  update(frame: GameFrame): void {
    if (!this.context) return;
    if (frame.restart) {
      this.context.runtime.resetGame();
      return;
    }
    if (this.outcome !== 'playing') return;

    const player = this.object('player-1');
    // A deleted controlling entity enters a recoverable loss instead of silently freezing.
    if (!player) { this.outcome = 'lost'; return; }
    const speed = this.context.runtime.getEntity('player-1');
    const moveSpeed = speed.ok ? speed.data.properties.speed : mazeConfig.playerSpeed;
    const frameMovement = vec2(frame.movement.x, frame.movement.y).clampLength().scale(moveSpeed * frame.deltaSeconds);
    this.tryMove(player, frameMovement.x, 0);
    this.tryMove(player, 0, frameMovement.y);

    for (const coin of this.entities('coin')) {
      if (player.isOverlappingObject(coin.object as EngineObject)) {
        this.context.runtime.deleteEntity(coin.id);
        this.hasKey = true;
        this.context.setScore(this.context.getScore() + 1);
      }
    }
    for (const enemy of this.entities('enemy')) {
      const object = enemy.object as EngineObject;
      this.moveEnemy(object, player, enemy.getSpeed(), frame.deltaSeconds);
      if (player.isOverlappingObject(object)) this.outcome = 'lost';
    }
    if (this.outcome === 'playing' && this.hasKey && this.overlapsPoint(player, mazeConfig.exitPosition.x, mazeConfig.exitPosition.y, 1)) this.outcome = 'won';
  }

  render(): void {
    const half = mazeConfig.halfSize;
    // Fit the full maze between the HUD and controls in embedded previews too.
    setCameraScale(Math.max(1, Math.min(mainCanvasSize.x - 32, mainCanvasSize.y - 140) / (half * 2)));
    drawRect(vec2(), vec2(half * 2), palette.floor);
    drawRect(vec2(mazeConfig.exitPosition.x, mazeConfig.exitPosition.y), vec2(1), this.hasKey ? palette.exitOpen : palette.exitLocked);
    const center = mainCanvasSize.scale(0.5);
    drawTextScreen(this.title, vec2(center.x, 28), 28, palette.text);
    const objective = this.hasKey ? 'Exit unlocked — reach the green gate.' : 'Collect the gold key, then reach the gate.';
    drawTextScreen(objective, vec2(center.x, 57), 18, this.hasKey ? palette.exitOpen : palette.key);
    drawTextScreen('Move: WASD / arrows   Restart: R', vec2(center.x, mainCanvasSize.y - 26), 17, palette.text);
    if (this.outcome !== 'playing') {
      const message = this.outcome === 'won' ? 'Escaped! Press R to play again.' : 'Caught by the sentinel! Press R to retry.';
      drawTextScreen(message, vec2(center.x, 88), 22, this.outcome === 'won' ? palette.exitOpen : palette.exitLocked, 2, palette.ink);
    }
  }

  reset(): void {
    if (!this.context) return;
    this.hasKey = false;
    this.outcome = 'playing';
    this.context.setScore(0);
    this.create('player-1', 'player', mazeConfig.playerStart.x, mazeConfig.playerStart.y, 0.75, mazeConfig.playerSpeed);
    this.create('enemy-1', 'enemy', mazeConfig.enemyStart.x, mazeConfig.enemyStart.y, 0.75, mazeConfig.enemySpeed);
    this.create('key-1', 'coin', mazeConfig.keyPosition.x, mazeConfig.keyPosition.y, 0.45);
    mazeConfig.walls.forEach((wall, index) => {
      const result = this.context!.createEntity({
        id: `wall-${index + 1}`, type: 'obstacle', dimension: '2d',
        position: { x: wall.x, y: wall.y }, properties: { size: { x: wall.width, y: wall.height } },
      });
      if (!result.ok) throw new Error(result.error.message);
    });
  }

  destroy(): void {
    this.context = undefined;
  }

  getState(): GameModuleState {
    return { hasKey: this.hasKey, outcome: this.outcome };
  }

  private create(id: string, type: 'player' | 'coin' | 'enemy', x: number, y: number, size: number, speed?: number): void {
    const result = this.context?.createEntity({
      id, type, dimension: '2d', position: { x, y },
      properties: { size: { x: size, y: size }, ...(speed === undefined ? {} : { speed }) },
    });
    if (!result?.ok) throw new Error(result?.error.message ?? `Could not create ${id}.`);
  }

  private object(id: string): EngineObject | undefined {
    return this.context?.getObject<EngineObject>(id);
  }

  private tryMove(player: EngineObject, x: number, y: number): void {
    // Swept AABB on each movement axis: cost is independent of requested speed.
    const previous = player.pos;
    const next = previous.add(vec2(x, y));
    for (const obstacle of this.entities('obstacle')) {
      const wall = obstacle.object as EngineObject;
      const hx = (player.size.x + wall.size.x) / 2;
      const hy = (player.size.y + wall.size.y) / 2;
      if (x && Math.abs(previous.y - wall.pos.y) < hy) {
        if (x > 0 && previous.x <= wall.pos.x - hx && next.x > wall.pos.x - hx) return;
        if (x < 0 && previous.x >= wall.pos.x + hx && next.x < wall.pos.x + hx) return;
      }
      if (y && Math.abs(previous.x - wall.pos.x) < hx) {
        if (y > 0 && previous.y <= wall.pos.y - hy && next.y > wall.pos.y - hy) return;
        if (y < 0 && previous.y >= wall.pos.y + hy && next.y < wall.pos.y + hy) return;
      }
    }
    if (Math.abs(next.x) > mazeConfig.halfSize - player.size.x / 2 || Math.abs(next.y) > mazeConfig.halfSize - player.size.y / 2) return;
    player.pos = next;
    if (this.isBlocked(player)) player.pos = previous;
  }

  private moveEnemy(enemy: EngineObject, player: EngineObject, speed: number, deltaSeconds: number): void {
    const delta = player.pos.subtract(enemy.pos);
    const step = delta.clampLength(speed * deltaSeconds);
    this.tryMove(enemy, step.x, 0);
    this.tryMove(enemy, 0, step.y);
  }

  private entities(type: EntityType): ManagedEntity[] {
    return this.context?.registry.list().filter((entity) => entity.type === type && entity.dimension === '2d') ?? [];
  }

  private isBlocked(object: EngineObject): boolean {
    return this.entities('obstacle').some((obstacle) => object.isOverlappingObject(obstacle.object as EngineObject));
  }

  private overlapsPoint(object: EngineObject, x: number, y: number, width = 1, height = width): boolean {
    return Math.abs(object.pos.x - x) * 2 < object.size.x + width
      && Math.abs(object.pos.y - y) * 2 < object.size.y + height;
  }
}

export const mazeEscapeGame = new MazeEscapeGame();
