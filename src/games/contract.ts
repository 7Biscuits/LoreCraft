import type { EntityRegistry, GameRuntime } from '../runtime';
import type { ApiResult, CreateEntityArgs, EntityState } from '../runtime';

/**
 * The small contract used by source-authored games in `src/games/<game-id>`.
 * A module owns its gameplay rules; the shared host owns LittleJS lifecycle and
 * exposes the same runtime adapter used by the bridge and MCP server.
 */
export interface GameModule {
  readonly id: string;
  readonly title: string;
  init(context: GameContext): void;
  update(): void;
  render(): void;
  reset(): void;
  destroy(): void;
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
  return { ok: errors.length === 0, errors };
}
