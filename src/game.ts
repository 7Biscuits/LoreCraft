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
  private player2D!: Rectangle;
  private obstacles2D: Rectangle[] = [];
  private collectibles2D: Rectangle[] = [];
  private player3D!: EngineObject3D;
  private obstacles3D: EngineObject3D[] = [];
  private collectibles3D: EngineObject3D[] = [];

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
    if (this.mode === '2D') this.create2D();
    else this.create3D();
  }

  private create2D(): void {
    this.player2D = new Rectangle(vec2(-6, -5), playerSize2D, palette.player);
    const obstacleData = [[-2, -1, 1.2, 5], [3, 3, 4, 1], [5, -3, 1, 4]] as const;
    this.obstacles2D = obstacleData.map(([x, y, width, height]) =>
      new Rectangle(vec2(x, y), vec2(width, height), palette.obstacle));
    this.collectibles2D = [[-5, 4], [0, 5], [1, -4], [6, 1], [-5, 0]].map(([x, y]) =>
      new Rectangle(vec2(x, y), vec2(0.45), palette.collectible));
  }

  private update2D(): void {
    const movement = keyDirection().normalize(playerSpeed * timeDelta);
    this.tryMove2D(vec2(movement.x, 0));
    this.tryMove2D(vec2(0, movement.y));

    for (const collectible of this.collectibles2D) {
      if (!collectible.destroyed && this.player2D.isOverlappingObject(collectible)) {
        collectible.destroy();
        this.score++;
      }
    }
  }

  private tryMove2D(delta: ReturnType<typeof vec2>): void {
    const previous = this.player2D.pos;
    const next = previous.add(delta);
    if (Math.abs(next.x) > arenaHalfSize || Math.abs(next.y) > arenaHalfSize) return;
    this.player2D.pos = next;
    if (this.obstacles2D.some((obstacle) => this.player2D.isOverlappingObject(obstacle))) {
      this.player2D.pos = previous;
    }
  }

  private create3D(): void {
    this.player3D = this.make3DBox(vec3(-6, 0.5, 5), playerSize3D, palette.player);
    const obstacleData = [[-3, 0.75, 0, 1.5, 1.5, 5], [3, 0.75, -2, 4, 1.5, 1.5], [4, 0.75, 4, 1.5, 1.5, 3]] as const;
    this.obstacles3D = obstacleData.map(([x, y, z, width, height, depth]) =>
      this.make3DBox(vec3(x, y, z), vec3(width, height, depth), palette.obstacle));
    this.collectibles3D = [[-5, -4], [-1, 3], [1, -4], [6, 1], [-5, 1]].map(([x, z]) =>
      this.make3DBox(vec3(x, 0.5, z), vec3(0.5), palette.collectible));
  }

  private make3DBox(pos: ReturnType<typeof vec3>, size: ReturnType<typeof vec3>, color: Color): EngineObject3D {
    const object = new EngineObject3D(pos, buildBox(), undefined, color);
    object.scale3D = size;
    object.emissive = 0.08;
    return object;
  }

  private update3D(): void {
    const direction = keyDirection().normalize(playerSpeed * timeDelta);
    const delta = vec3(direction.x, 0, -direction.y);
    this.tryMove3D(vec3(delta.x, 0, 0));
    this.tryMove3D(vec3(0, 0, delta.z));
    this.player3D.rotation3D.y += timeDelta;

    for (const collectible of this.collectibles3D) {
      if (!collectible.destroyed && isOverlapping3D(this.player3D.pos3D, playerSize3D, collectible.pos3D, vec3(0.5))) {
        collectible.destroy();
        this.score++;
      }
    }
  }

  private tryMove3D(delta: ReturnType<typeof vec3>): void {
    const previous = this.player3D.pos3D;
    const next = previous.add(delta);
    if (Math.abs(next.x) > arenaHalfSize || Math.abs(next.z) > arenaHalfSize) return;
    this.player3D.pos3D = next;
    const collided = this.obstacles3D.some((obstacle) =>
      isOverlapping3D(next, playerSize3D, obstacle.pos3D, obstacle.scale3D));
    if (collided) this.player3D.pos3D = previous;
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
}

export function startGame(): void {
  const game = new DemoGame();
  void engineInit(
    () => game.init(),
    () => game.update(),
    undefined,
    () => game.render(),
  );
}
