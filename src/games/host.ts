import {
  Color,
  EngineObject,
  EngineObject3D,
  Render3DPlugin,
  buildBox,
  drawRect,
  engineInit,
  render3D,
  setCameraPos,
  setCameraScale,
  setCanvasClearColor,
  setEngineVariableStep,
  vec2,
  vec3,
} from 'littlejsengine';
import { EntityRegistry, GameRuntime } from '../runtime';
import type { ApiResult, CreateEntityArgs, EntityPosition, EntityType, ManagedEntity } from '../runtime';
import type { GameContext, GameModule } from './contract';
import { validateGameModule } from './contract';

const colors: Record<EntityType, Color> = {
  player: new Color(0.24, 0.85, 1),
  coin: new Color(1, 0.8, 0.2),
  enemy: new Color(0.9, 0.33, 0.38),
  obstacle: new Color(0.32, 0.41, 0.55),
};

class RuntimeRectangle extends EngineObject {
  constructor(pos: ReturnType<typeof vec2>, size: ReturnType<typeof vec2>, color: Color) {
    super(pos, size);
    this.color = color;
    this.gravityScale = 0;
  }

  override render(): void {
    drawRect(this.pos, this.size, this.color);
  }
}

/** Runs one authored module through LittleJS's existing engine lifecycle. */
export class AuthoredGameHost {
  private score = 0;
  private initialized = false;
  private readonly registry = new EntityRegistry();
  readonly runtime: GameRuntime;
  private readonly context: GameContext;

  constructor(private readonly game: GameModule) {
    const validation = validateGameModule(game);
    if (!validation.ok) throw new Error(`Invalid game module: ${validation.errors.join(' ')}`);
    this.runtime = new GameRuntime(this.registry, {
      createEntity: (args) => this.createRuntimeEntity(args),
      getGameState: () => ({ mode: game.id, score: this.score }),
      resetGame: () => this.reset(),
    });
    this.context = {
      runtime: this.runtime,
      registry: this.registry,
      createEntity: (args) => this.runtime.createEntity(args),
      getObject: <T>(id: string) => {
        const entity = this.registry.get(id);
        return entity.ok ? entity.data.object as T : undefined;
      },
      setScore: (score) => { this.score = score; },
      getScore: () => this.score,
    };
  }

  start(): GameRuntime {
    void engineInit(
      () => this.init(),
      () => this.game.update(),
      undefined,
      () => this.game.render(),
    );
    return this.runtime;
  }

  private init(): void {
    setEngineVariableStep(true);
    setCameraPos(vec2());
    setCameraScale(48);
    setCanvasClearColor(new Color(0.05, 0.08, 0.14));

    // Keep 3D entities created through the existing runtime adapter supported.
    new Render3DPlugin();
    render3D.camera.pos = vec3(0, 10, 13);
    render3D.camera.lookAt(vec3());
    this.initialized = true;
    this.game.init(this.context);
  }

  private reset(): void {
    if (!this.initialized) return;
    for (const entity of this.registry.list()) this.runtime.deleteEntity(entity.id);
    this.score = 0;
    this.game.reset();
  }

  private createRuntimeEntity(args: CreateEntityArgs): ApiResult<ManagedEntity> {
    if (args.dimension === '2d') {
      const size = args.properties?.size ?? this.defaultSize(args.type, '2d');
      const object = new RuntimeRectangle(vec2(args.position.x, args.position.y), vec2(size.x, size.y), colors[args.type]);
      return { ok: true, data: this.manage2D(args, object) };
    }
    const size = args.properties?.size ?? this.defaultSize(args.type, '3d');
    if (!('z' in args.position) || !('z' in size)) {
      return { ok: false, error: { code: 'INVALID_ARGUMENT', message: '3d entities require z coordinates.' } };
    }
    const object = new EngineObject3D(vec3(args.position.x, args.position.y, args.position.z), buildBox(), undefined, colors[args.type]);
    object.scale3D = vec3(size.x, size.y, size.z);
    object.emissive = 0.08;
    object.gravityScale = 0;
    return { ok: true, data: this.manage3D(args, object) };
  }

  private manage2D(args: CreateEntityArgs, object: RuntimeRectangle): ManagedEntity {
    let speed = args.type === 'player' ? 6 : 0;
    return {
      id: args.id, type: args.type, dimension: '2d', object,
      getPosition: () => ({ x: object.pos.x, y: object.pos.y }),
      setPosition: (position) => { object.pos = vec2(position.x, position.y); },
      getSize: () => ({ x: object.size.x, y: object.size.y }),
      setSize: (size) => { object.size = vec2(size.x, size.y); },
      getRotation: () => object.angle,
      setRotation: (rotation) => { object.angle = rotation; },
      getSpeed: () => speed,
      setSpeed: (value) => { speed = value; },
      destroy: () => object.destroy(),
      isDestroyed: () => object.destroyed,
    };
  }

  private manage3D(args: CreateEntityArgs, object: EngineObject3D): ManagedEntity {
    let speed = args.type === 'player' ? 6 : 0;
    return {
      id: args.id, type: args.type, dimension: '3d', object,
      getPosition: () => ({ x: object.pos3D.x, y: object.pos3D.y, z: object.pos3D.z }),
      setPosition: (position) => { if ('z' in position) object.pos3D = vec3(position.x, position.y, position.z); },
      getSize: () => ({ x: object.scale3D.x, y: object.scale3D.y, z: object.scale3D.z }),
      setSize: (size) => { if ('z' in size) object.scale3D = vec3(size.x, size.y, size.z); },
      getRotation: () => object.rotation3D.y,
      setRotation: (rotation) => { object.rotation3D.y = rotation; },
      getSpeed: () => speed,
      setSpeed: (value) => { speed = value; },
      destroy: () => object.destroy(),
      isDestroyed: () => object.destroyed,
    };
  }

  private defaultSize(type: EntityType, dimension: '2d' | '3d'): EntityPosition {
    const size = type === 'coin' ? 0.45 : type === 'player' ? 0.8 : 1;
    return dimension === '2d' ? { x: size, y: size } : { x: size, y: size, z: size };
  }
}

export function startAuthoredGame(game: GameModule): GameRuntime {
  return new AuthoredGameHost(game).start();
}
