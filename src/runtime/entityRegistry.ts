import type { ApiResult, EntityState, ManagedEntity } from './types';

const success = <T>(data: T): ApiResult<T> => ({ ok: true, data });
const error = (code: 'DUPLICATE_ID' | 'ENTITY_NOT_FOUND', message: string): ApiResult<never> => ({
  ok: false,
  error: { code, message },
});

/** Maps stable external IDs to the live game objects they represent. */
export class EntityRegistry {
  private readonly entities = new Map<string, ManagedEntity>();

  register(entity: ManagedEntity): ApiResult<ManagedEntity> {
    this.pruneDestroyed();
    if (this.entities.has(entity.id)) {
      return error('DUPLICATE_ID', `Entity ID "${entity.id}" is already registered.`);
    }
    this.entities.set(entity.id, entity);
    return success(entity);
  }

  get(id: string): ApiResult<ManagedEntity> {
    const entity = this.entities.get(id);
    if (!entity || entity.isDestroyed()) {
      this.entities.delete(id);
      return error('ENTITY_NOT_FOUND', `No active entity exists with ID "${id}".`);
    }
    return success(entity);
  }

  getByObject(object: unknown): ManagedEntity | undefined {
    this.pruneDestroyed();
    return [...this.entities.values()].find((entity) => entity.object === object);
  }

  remove(id: string): ApiResult<ManagedEntity> {
    const found = this.get(id);
    if (!found.ok) return found;
    this.entities.delete(id);
    return found;
  }

  list(): ManagedEntity[] {
    this.pruneDestroyed();
    return [...this.entities.values()];
  }

  clear(): void {
    this.entities.clear();
  }

  toStates(): EntityState[] {
    return this.list().map((entity) => ({
      id: entity.id,
      type: entity.type,
      dimension: entity.dimension,
      position: entity.getPosition(),
      size: entity.getSize(),
      properties: { speed: entity.getSpeed(), rotation: entity.getRotation() },
    }));
  }

  private pruneDestroyed(): void {
    for (const [id, entity] of this.entities) {
      if (entity.isDestroyed()) this.entities.delete(id);
    }
  }
}
