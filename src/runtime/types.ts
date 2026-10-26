export type EntityType = 'player' | 'coin' | 'enemy' | 'obstacle';
export type EntityDimension = '2d' | '3d';

export interface Position2D {
  x: number;
  y: number;
}

export interface Position3D extends Position2D {
  z: number;
}

export type EntityPosition = Position2D | Position3D;

export interface EntityProperties {
  size?: EntityPosition;
  speed?: number;
  rotation?: number;
}

export interface CreateEntityArgs {
  id: string;
  type: EntityType;
  dimension: EntityDimension;
  position: EntityPosition;
  properties?: EntityProperties;
}

export interface EntityState {
  id: string;
  type: EntityType;
  dimension: EntityDimension;
  position: EntityPosition;
  size: EntityPosition;
  properties: Required<Pick<EntityProperties, 'speed' | 'rotation'>>;
}

export interface GameStateSnapshot {
  mode: string;
  score: number;
  entities: EntityState[];
  state?: GameModuleState;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type GameModuleState = Record<string, JsonValue>;

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: 'DUPLICATE_ID' | 'ENTITY_NOT_FOUND' | 'INVALID_ARGUMENT' | 'UNSUPPORTED_ENTITY_TYPE' | 'OPERATION_FAILED';
    message: string;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

export interface ManagedEntity {
  id: string;
  type: EntityType;
  dimension: EntityDimension;
  object: unknown;
  getPosition(): EntityPosition;
  setPosition(position: EntityPosition): void;
  getSize(): EntityPosition;
  setSize(size: EntityPosition): void;
  getRotation(): number;
  setRotation(rotation: number): void;
  getSpeed(): number;
  setSpeed(speed: number): void;
  destroy(): void;
  isDestroyed(): boolean;
}

export interface RuntimeBindings {
  isDisposed?(): boolean;
  createEntity(args: CreateEntityArgs): ApiResult<ManagedEntity>;
  getGameState(): Omit<GameStateSnapshot, 'entities'>;
  resetGame(): void;
}
