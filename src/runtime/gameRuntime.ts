import { EntityRegistry } from './entityRegistry';
import type {
  ApiError,
  ApiResult,
  CreateEntityArgs,
  EntityDimension,
  EntityPosition,
  EntityProperties,
  EntityState,
  EntityType,
  GameStateSnapshot,
  ManagedEntity,
  RuntimeBindings,
} from './types';

const entityTypes: readonly EntityType[] = ['player', 'coin', 'enemy', 'obstacle'];

const fail = (code: ApiError['error']['code'], message: string): ApiError => ({ ok: false, error: { code, message } });
const pass = <T>(data: T): ApiResult<T> => ({ ok: true, data });

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function validatePosition(position: EntityPosition, dimension: EntityDimension, label: string): ApiError | undefined {
  if (!isFiniteNumber(position?.x) || !isFiniteNumber(position?.y)) {
    return fail('INVALID_ARGUMENT', `${label} must include finite x and y coordinates.`);
  }
  if (dimension === '3d' && (!('z' in position) || !isFiniteNumber(position.z))) {
    return fail('INVALID_ARGUMENT', `${label} for a 3d entity must include a finite z coordinate.`);
  }
  if (dimension === '2d' && 'z' in position) {
    return fail('INVALID_ARGUMENT', `${label} for a 2d entity cannot include z.`);
  }
  return undefined;
}

function validateProperties(properties: EntityProperties | undefined, dimension: EntityDimension): ApiError | undefined {
  if (!properties) return undefined;
  if (properties.size) {
    const invalidSize = validatePosition(properties.size, dimension, 'properties.size');
    if (invalidSize) return invalidSize;
  }
  if (properties.speed !== undefined && (!isFiniteNumber(properties.speed) || properties.speed < 0)) {
    return fail('INVALID_ARGUMENT', 'properties.speed must be a finite number greater than or equal to 0.');
  }
  if (properties.rotation !== undefined && !isFiniteNumber(properties.rotation)) {
    return fail('INVALID_ARGUMENT', 'properties.rotation must be a finite number.');
  }
  return undefined;
}

/** Structured operations for live LittleJS objects. It intentionally owns no loop or renderer. */
export class GameRuntime {
  constructor(
    readonly registry: EntityRegistry,
    private readonly bindings: RuntimeBindings,
  ) {}

  createEntity(args: CreateEntityArgs): ApiResult<EntityState> {
    const invalid = this.validateCreateArgs(args);
    if (invalid) return invalid;
    const existing = this.registry.get(args.id);
    if (existing.ok) return fail('DUPLICATE_ID', `Entity ID "${args.id}" is already registered.`);

    const created = this.bindings.createEntity(args);
    if (!created.ok) return created;
    const registered = this.registry.register(created.data);
    if (!registered.ok) {
      created.data.destroy();
      return registered;
    }
    const updated = this.applyProperties(created.data, args.properties);
    if (!updated.ok) {
      created.data.destroy();
      this.registry.remove(created.data.id);
      return updated;
    }
    return pass(this.toState(created.data));
  }

  getEntity(id: string): ApiResult<EntityState> {
    const entity = this.getActiveEntity(id);
    return entity.ok ? pass(this.toState(entity.data)) : entity;
  }

  listEntities(): ApiResult<EntityState[]> {
    return pass(this.registry.toStates());
  }

  setEntityPosition(id: string, position: EntityPosition): ApiResult<Pick<EntityState, 'id' | 'position'>> {
    const entity = this.getActiveEntity(id);
    if (!entity.ok) return entity;
    const invalid = validatePosition(position, entity.data.dimension, 'position');
    if (invalid) return invalid;
    entity.data.setPosition(position);
    return pass({ id, position: entity.data.getPosition() });
  }

  setEntityProperties(id: string, properties: EntityProperties): ApiResult<EntityState> {
    const entity = this.getActiveEntity(id);
    if (!entity.ok) return entity;
    const invalid = validateProperties(properties, entity.data.dimension);
    if (invalid) return invalid;
    const updated = this.applyProperties(entity.data, properties);
    return updated.ok ? pass(this.toState(entity.data)) : updated;
  }

  deleteEntity(id: string): ApiResult<{ id: string }> {
    const removed = this.registry.remove(id);
    if (!removed.ok) return removed;
    removed.data.destroy();
    return pass({ id });
  }

  getGameState(): ApiResult<GameStateSnapshot> {
    return pass({ ...this.bindings.getGameState(), entities: this.registry.toStates() });
  }

  resetGame(): ApiResult<GameStateSnapshot> {
    try {
      this.bindings.resetGame();
      return this.getGameState();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The game reset failed.';
      return fail('OPERATION_FAILED', message);
    }
  }

  private getActiveEntity(id: string): ApiResult<ManagedEntity> {
    if (typeof id !== 'string' || !id.trim()) return fail('INVALID_ARGUMENT', 'Entity ID must be a non-empty string.');
    return this.registry.get(id);
  }

  private validateCreateArgs(args: CreateEntityArgs): ApiError | undefined {
    if (!args || typeof args.id !== 'string' || !args.id.trim()) {
      return fail('INVALID_ARGUMENT', 'Entity ID must be a non-empty string.');
    }
    if (!entityTypes.includes(args.type)) return fail('UNSUPPORTED_ENTITY_TYPE', `Unsupported entity type "${String(args.type)}".`);
    if (args.dimension !== '2d' && args.dimension !== '3d') return fail('INVALID_ARGUMENT', 'dimension must be either "2d" or "3d".');
    return validatePosition(args.position, args.dimension, 'position') ?? validateProperties(args.properties, args.dimension);
  }

  private applyProperties(entity: ManagedEntity, properties: EntityProperties | undefined): ApiResult<ManagedEntity> {
    if (!properties) return pass(entity);
    if (properties.size) entity.setSize(properties.size);
    if (properties.speed !== undefined) entity.setSpeed(properties.speed);
    if (properties.rotation !== undefined) entity.setRotation(properties.rotation);
    return pass(entity);
  }

  private toState(entity: ManagedEntity): EntityState {
    return {
      id: entity.id,
      type: entity.type,
      dimension: entity.dimension,
      position: entity.getPosition(),
      size: entity.getSize(),
      properties: { speed: entity.getSpeed(), rotation: entity.getRotation() },
    };
  }
}
