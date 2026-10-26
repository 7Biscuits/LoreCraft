import { Color, EngineObject, drawRect, drawTextScreen, keyDirection, keyIsDown, keyWasPressed, mainCanvasSize, timeDelta, vec2 } from 'littlejsengine';
import type { GameContext, GameModule } from '../contract';
import { mazeConfig } from './config';

type Outcome = 'playing' | 'won' | 'lost';

const palette = {
  floor: new Color(0.1, 0.16, 0.26),
  wall: new Color(0.31, 0.41, 0.57),
  key: new Color(1, 0.8, 0.2),
  exitLocked: new Color(0.7, 0.24, 0.34),
  exitOpen: new Color(0.32, 0.9, 0.54),
  text: new Color(0.94, 0.97, 1),
  ink: new Color(0.05, 0.08, 0.14),
};

/** A source-authored top-down game: collect a key, unlock the exit, and evade the sentinel. */
class MazeEscapeGame implements GameModule {
  readonly id = 'maze-escape';
  readonly title = 'Maze Escape';
  private context?: GameContext;
  private hasKey = false;
  private outcome: Outcome = 'playing';

  init(context: GameContext): void {
    this.context = context;
    this.reset();
  }

  update(): void {
    if (!this.context) return;
    if (keyWasPressed('KeyR')) {
      this.context.runtime.resetGame();
      return;
    }
    if (this.outcome !== 'playing') return;

    const player = this.object('player-1');
    const enemy = this.object('enemy-1');
    if (!player || !enemy) return;
    const speed = this.context.runtime.getEntity('player-1');
    const moveSpeed = speed.ok ? speed.data.properties.speed : mazeConfig.playerSpeed;
    // LittleJS normalizes a zero vector upward, so clamp the combined input instead.
    const movement = keyDirection();
    movement.x += Number(keyIsDown('KeyD')) - Number(keyIsDown('KeyA'));
    movement.y += Number(keyIsDown('KeyW')) - Number(keyIsDown('KeyS'));
    const frameMovement = movement.clampLength(moveSpeed * timeDelta);
    this.tryMove(player, frameMovement.x, 0);
    this.tryMove(player, 0, frameMovement.y);

    const key = this.object('key-1');
    if (key && player.isOverlappingObject(key)) {
      this.context.runtime.deleteEntity('key-1');
      this.hasKey = true;
      this.context.setScore(1);
    }
    this.moveEnemy(enemy, player);
    if (player.isOverlappingObject(enemy)) this.outcome = 'lost';
    if (this.hasKey && this.overlapsPoint(player, mazeConfig.exitPosition.x, mazeConfig.exitPosition.y, 1)) this.outcome = 'won';
  }

  render(): void {
    const half = mazeConfig.halfSize;
    drawRect(vec2(), vec2(half * 2), palette.floor);
    for (const wall of mazeConfig.walls) drawRect(vec2(wall.x, wall.y), vec2(wall.width, wall.height), palette.wall);
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
    this.create('enemy-1', 'enemy', mazeConfig.enemyStart.x, mazeConfig.enemyStart.y, 0.75);
    this.create('key-1', 'coin', mazeConfig.keyPosition.x, mazeConfig.keyPosition.y, 0.45);
  }

  destroy(): void {
    // The host destroys registry-backed objects before a reset or replacement.
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
    const previous = player.pos;
    const next = previous.add(vec2(x, y));
    if (Math.abs(next.x) > mazeConfig.halfSize - 0.5 || Math.abs(next.y) > mazeConfig.halfSize - 0.5) return;
    player.pos = next;
    if (mazeConfig.walls.some((wall) => this.overlapsPoint(player, wall.x, wall.y, wall.width, wall.height))) player.pos = previous;
  }

  private moveEnemy(enemy: EngineObject, player: EngineObject): void {
    const delta = player.pos.subtract(enemy.pos);
    const step = delta.normalize(mazeConfig.enemySpeed * timeDelta);
    const previous = enemy.pos;
    enemy.pos = previous.add(step);
    if (mazeConfig.walls.some((wall) => this.overlapsPoint(enemy, wall.x, wall.y, wall.width, wall.height))) enemy.pos = previous;
  }

  private overlapsPoint(object: EngineObject, x: number, y: number, width = 1, height = width): boolean {
    return Math.abs(object.pos.x - x) * 2 < object.size.x + width
      && Math.abs(object.pos.y - y) * 2 < object.size.y + height;
  }
}

export const mazeEscapeGame = new MazeEscapeGame();
