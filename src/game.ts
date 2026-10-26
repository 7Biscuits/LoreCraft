import {
  Color,
  EngineObject,
  EngineObject3D,
  Render3DPlugin,
  buildBox,
  drawRect,
  drawTextScreen,
  engineInit,
  isOverlapping3D,
  keyDirection,
  keyWasPressed,
  mainCanvasSize,
  render3D,
  setCameraPos,
  setCameraScale,
  setCanvasClearColor,
  setEngineVariableStep,
  timeDelta,
  vec2,
  vec3,
} from 'littlejsengine';
import { EntityRegistry, GameRuntime } from './runtime';
import type { ApiResult, CreateEntityArgs, EntityPosition, EntityType, ManagedEntity } from './runtime';

type Mode = '2D' | '3D';

const playerSize2D = vec2(0.8);
const playerSize3D = vec3(0.75, 0.75, 0.75);
const playerSpeed = 6;
const arenaHalfSize = 8;
const palette = {
  ink: new Color(0.05, 0.08, 0.14),
  floor: new Color(0.12, 0.19, 0.3),
  wall: new Color(0.32, 0.41, 0.55),
  player: new Color(0.24, 0.85, 1),
  collectible: new Color(1, 0.8, 0.2),
  obstacle: new Color(0.9, 0.33, 0.38),
  text: new Color(0.94, 0.97, 1),
};

class Rectangle extends EngineObject {
  constructor(pos: ReturnType<typeof vec2>, size: ReturnType<typeof vec2>, color: Color) {
    super(pos, size);
    this.color = color;
  }

  override render(): void {
    drawRect(this.pos, this.size, this.color);
  }
}

class DemoGame {
  private mode: Mode = '2D';
  private score = 0;
  private player2D?: Rectangle;
  private obstacles2D: Rectangle[] = [];
  private collectibles2D: Rectangle[] = [];
  private player3D?: EngineObject3D;
  private obstacles3D: EngineObject3D[] = [];
  private collectibles3D: EngineObject3D[] = [];
  private readonly registry = new EntityRegistry();
  readonly runtime: GameRuntime;

  constructor() {
    this.runtime = new GameRuntime(this.registry, {
      createEntity: (args) => this.createRuntimeEntity(args),
      getGameState: () => ({ mode: this.mode, score: this.score }),
      resetGame: () => this.reset(),
    });
  }

  init(): void {
    setEngineVariableStep(true);
    setCameraPos(vec2());
    setCameraScale(48);
    setCanvasClearColor(palette.ink);

    new Render3DPlugin();
    render3D.camera.pos = vec3(0, 10, 13);
    render3D.camera.lookAt(vec3());
    render3D.setSky(new Color(0.07, 0.12, 0.22), new Color(0.19, 0.32, 0.46));
    render3D.setFog(13, 24);

    this.reset();
  }

  update(): void {
    if (keyWasPressed('Tab')) {
      this.mode = this.mode === '2D' ? '3D' : '2D';
      this.reset();
    }
    if (keyWasPressed('KeyR')) this.reset();

    if (this.mode === '2D') this.update2D();
    else this.update3D();
  }

  render(): void {
    if (this.mode === '2D') this.draw2DArena();
    this.drawHud();
  }

  private reset(): void {
    this.score = 0;
    this.destroy2D();
    this.destroy3D();
    this.registry.clear();
    if (this.mode === '2D') this.create2D();
    else this.create3D();
  }

  private create2D(): void {
    this.player2D = this.create2DEntity('player-1', 'player', -6, -5, playerSize2D);
    const obstacleData = [[-2, -1, 1.2, 5], [3, 3, 4, 1], [5, -3, 1, 4]] as const;
    this.obstacles2D = obstacleData.map(([x, y, width, height], index) =>
      this.create2DEntity(`obstacle-${index + 1}`, 'obstacle', x, y, vec2(width, height)));
    this.collectibles2D = [[-5, 4], [0, 5], [1, -4], [6, 1], [-5, 0]].map(([x, y], index) =>
      this.create2DEntity(`coin-${index + 1}`, 'coin', x, y, vec2(0.45)));
  }

  private update2D(): void {
    if (!this.player2D || this.player2D.destroyed) return;
    const movement = keyDirection().normalize(this.playerSpeed() * timeDelta);
    this.tryMove2D(vec2(movement.x, 0));
    this.tryMove2D(vec2(0, movement.y));

    for (const collectible of this.collectibles2D) {
      if (!collectible.destroyed && this.player2D.isOverlappingObject(collectible)) {
        this.deleteObject(collectible);
        this.score++;
      }
    }
  }

  private tryMove2D(delta: ReturnType<typeof vec2>): void {
    const player = this.player2D;
    if (!player || player.destroyed) return;
    const previous = player.pos;
    const next = previous.add(delta);
    if (Math.abs(next.x) > arenaHalfSize || Math.abs(next.y) > arenaHalfSize) return;
    player.pos = next;
    if (this.obstacles2D.some((obstacle) => !obstacle.destroyed && player.isOverlappingObject(obstacle))) {
      player.pos = previous;
    }
  }

  private create3D(): void {
    this.player3D = this.create3DEntity('player-1', 'player', -6, 0.5, 5, playerSize3D);
    const obstacleData = [[-3, 0.75, 0, 1.5, 1.5, 5], [3, 0.75, -2, 4, 1.5, 1.5], [4, 0.75, 4, 1.5, 1.5, 3]] as const;
    this.obstacles3D = obstacleData.map(([x, y, z, width, height, depth], index) =>
      this.create3DEntity(`obstacle-${index + 1}`, 'obstacle', x, y, z, vec3(width, height, depth)));
    this.collectibles3D = [[-5, -4], [-1, 3], [1, -4], [6, 1], [-5, 1]].map(([x, z], index) =>
      this.create3DEntity(`coin-${index + 1}`, 'coin', x, 0.5, z, vec3(0.5)));
  }

  private make3DBox(pos: ReturnType<typeof vec3>, size: ReturnType<typeof vec3>, color: Color): EngineObject3D {
    const object = new EngineObject3D(pos, buildBox(), undefined, color);
    object.scale3D = size;
    object.emissive = 0.08;
    return object;
  }

  private update3D(): void {
    if (!this.player3D || this.player3D.destroyed) return;
    const direction = keyDirection().normalize(this.playerSpeed() * timeDelta);
    const delta = vec3(direction.x, 0, -direction.y);
    this.tryMove3D(vec3(delta.x, 0, 0));
    this.tryMove3D(vec3(0, 0, delta.z));
    this.player3D.rotation3D.y += timeDelta;

    for (const collectible of this.collectibles3D) {
      if (!collectible.destroyed && isOverlapping3D(
        this.player3D.pos3D,
        this.player3D.scale3D,
        collectible.pos3D,
        collectible.scale3D,
      )) {
        this.deleteObject(collectible);
        this.score++;
      }
    }
  }

  private tryMove3D(delta: ReturnType<typeof vec3>): void {
    const player = this.player3D;
    if (!player || player.destroyed) return;
    const previous = player.pos3D;
    const next = previous.add(delta);
    if (Math.abs(next.x) > arenaHalfSize || Math.abs(next.z) > arenaHalfSize) return;
    player.pos3D = next;
    const collided = this.obstacles3D.some((obstacle) =>
      !obstacle.destroyed && isOverlapping3D(next, player.scale3D, obstacle.pos3D, obstacle.scale3D));
    if (collided) player.pos3D = previous;
  }

  private draw2DArena(): void {
    drawRect(vec2(), vec2(arenaHalfSize * 2), palette.floor);
    const edge = 0.3;
    drawRect(vec2(0, arenaHalfSize), vec2(arenaHalfSize * 2 + edge, edge), palette.wall);
    drawRect(vec2(0, -arenaHalfSize), vec2(arenaHalfSize * 2 + edge, edge), palette.wall);
    drawRect(vec2(arenaHalfSize, 0), vec2(edge, arenaHalfSize * 2), palette.wall);
    drawRect(vec2(-arenaHalfSize, 0), vec2(edge, arenaHalfSize * 2), palette.wall);
  }

  private drawHud(): void {
    const center = mainCanvasSize.scale(0.5);
    drawTextScreen(`LittleJS ${this.mode} demo`, vec2(center.x, 28), 28, palette.text);
    drawTextScreen(`Score: ${this.score}`, vec2(18, 62), 22, palette.collectible, 2, palette.ink, 'left');
    drawTextScreen('Move: WASD / arrows   Restart: R   Switch scene: Tab', vec2(center.x, mainCanvasSize.y - 26), 17, palette.text);
    if (this.score === 5) drawTextScreen('All collectibles found — press R to play again!', vec2(center.x, 62), 20, palette.player);
  }

  private destroy2D(): void {
    this.player2D?.destroy();
    this.obstacles2D.forEach((object) => object.destroy());
    this.collectibles2D.forEach((object) => object.destroy());
    this.obstacles2D = [];
    this.collectibles2D = [];
  }

  private destroy3D(): void {
    this.player3D?.destroy();
    this.obstacles3D.forEach((object) => object.destroy());
    this.collectibles3D.forEach((object) => object.destroy());
    this.obstacles3D = [];
    this.collectibles3D = [];
  }

  private create2DEntity(id: string, type: EntityType, x: number, y: number, size: ReturnType<typeof vec2>): Rectangle {
    const created = this.runtime.createEntity({
      id,
      type,
      dimension: '2d',
      position: { x, y },
      properties: { size: { x: size.x, y: size.y }, speed: type === 'player' ? playerSpeed : 0 },
    });
    return this.getCreatedObject<Rectangle>(id, created);
  }

  private create3DEntity(
    id: string,
    type: EntityType,
    x: number,
    y: number,
    z: number,
    size: ReturnType<typeof vec3>,
  ): EngineObject3D {
    const created = this.runtime.createEntity({
      id,
      type,
      dimension: '3d',
      position: { x, y, z },
      properties: { size: { x: size.x, y: size.y, z: size.z }, speed: type === 'player' ? playerSpeed : 0 },
    });
    return this.getCreatedObject<EngineObject3D>(id, created);
  }

  private getCreatedObject<T>(id: string, result: ApiResult<unknown>): T {
    if (!result.ok) throw new Error(result.error.message);
    const registered = this.registry.get(id);
    if (!registered.ok) throw new Error(registered.error.message);
    return registered.data.object as T;
  }

  private createRuntimeEntity(args: CreateEntityArgs): ApiResult<ManagedEntity> {
    if (args.dimension === '2d') {
      const position = args.position;
      const size = args.properties?.size ?? this.defaultSize(args.type, '2d');
      const object = new Rectangle(vec2(position.x, position.y), vec2(size.x, size.y), this.colorFor(args.type));
      return { ok: true, data: this.manage2D(args, object) };
    }

    const position = args.position;
    const size = args.properties?.size ?? this.defaultSize(args.type, '3d');
    if (!('z' in position) || !('z' in size)) {
      return { ok: false, error: { code: 'INVALID_ARGUMENT', message: '3d entities require z coordinates.' } };
    }
    const object = this.make3DBox(vec3(position.x, position.y, position.z), vec3(size.x, size.y, size.z), this.colorFor(args.type));
    return { ok: true, data: this.manage3D(args, object) };
  }

  private manage2D(args: CreateEntityArgs, object: Rectangle): ManagedEntity {
    let speed = args.type === 'player' ? playerSpeed : 0;
    return {
      id: args.id,
      type: args.type,
      dimension: '2d',
      object,
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
    let speed = args.type === 'player' ? playerSpeed : 0;
    return {
      id: args.id,
      type: args.type,
      dimension: '3d',
      object,
      getPosition: () => ({ x: object.pos3D.x, y: object.pos3D.y, z: object.pos3D.z }),
      setPosition: (position) => {
        if ('z' in position) object.pos3D = vec3(position.x, position.y, position.z);
      },
      getSize: () => ({ x: object.scale3D.x, y: object.scale3D.y, z: object.scale3D.z }),
      setSize: (size) => {
        if ('z' in size) object.scale3D = vec3(size.x, size.y, size.z);
      },
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

  private colorFor(type: EntityType): Color {
    return type === 'player' ? palette.player : type === 'coin' ? palette.collectible : type === 'obstacle' ? palette.obstacle : palette.wall;
  }

  private deleteObject(object: unknown): void {
    const entity = this.registry.getByObject(object);
    if (entity) this.runtime.deleteEntity(entity.id);
  }

  private playerSpeed(): number {
    const player = this.runtime.getEntity('player-1');
    return player.ok ? player.data.properties.speed : playerSpeed;
  }
}

export function startGame(): GameRuntime {
  const game = new DemoGame();
  void engineInit(
    () => game.init(),
    () => game.update(),
    undefined,
    () => game.render(),
  );
  return game.runtime;
}
