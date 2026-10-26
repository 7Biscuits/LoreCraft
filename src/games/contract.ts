import type { EntityRegistry, GameRuntime } from '../runtime';
import type { ApiResult, CreateEntityArgs, EntityState, GameModuleState, Position2D } from '../runtime';

/**
 * The small contract used by source-authored games in `src/games/<game-id>`.
 * A module owns its gameplay rules; the shared host owns LittleJS lifecycle and
 * exposes the same runtime adapter used by the bridge and MCP server.
 */
export interface GameModule {
  readonly id: string;
  readonly title: string;
  init(context: GameContext): void;
  update(frame: GameFrame): void;
  render(): void;
  reset(): void;
  destroy(): void;
  getState?(): GameModuleState;
}

/** Engine input is sampled once by the host; gameplay can also be driven deterministically. */
export interface GameFrame {
  deltaSeconds: number;
  movement: Position2D;
  restart: boolean;
  throwRock?: boolean;
}

export interface GameContext {
  readonly runtime: GameRuntime;
  readonly registry: EntityRegistry;
  createEntity(args: CreateEntityArgs): ApiResult<EntityState>;
  getObject<T>(id: string): T | undefined;
  setScore(score: number): void;
  getScore(): number;
}

export interface GameModuleValidation {
  ok: boolean;
  errors: string[];
}

/** Validates the intentionally small module surface before a game is made active. */
export function validateGameModule(game: Partial<GameModule>): GameModuleValidation {
  const errors: string[] = [];
  if (typeof game.id !== 'string' || !/^[a-z0-9-]+$/.test(game.id)) {
    errors.push('Game id must use lowercase letters, numbers, and hyphens.');
  }
  if (typeof game.title !== 'string' || !game.title.trim()) errors.push('Game title must be a non-empty string.');
  for (const method of ['init', 'update', 'render', 'reset', 'destroy'] as const) {
    if (typeof game[method] !== 'function') errors.push(`Game module must implement ${method}().`);
  }
  if (game.getState !== undefined && typeof game.getState !== 'function') errors.push('getState must be a function.');
  return { ok: errors.length === 0, errors };
}
