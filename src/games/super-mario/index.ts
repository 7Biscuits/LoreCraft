import {
  Color,
  EngineObject,
  drawCircle,
  drawRect,
  drawText,
  drawTextScreen,
  keyWasPressed,
  mainCanvasSize,
  setCameraPos,
  setCanvasClearColor,
  setGLEnable,
  vec2,
  zzfx,
} from 'littlejsengine';
import type { EntityType, GameModuleState, ManagedEntity } from '../../runtime';
import type { GameContext, GameFrame, GameModule } from '../contract';
import type { BlockDef } from './config';
import { marioConfig } from './config';

type Outcome = 'playing' | 'won' | 'lost';

const colors = {
  sky: new Color(0.36, 0.58, 0.98),
  cloud: new Color(0.96, 0.98, 1.0, 0.92),
  hill: new Color(0.18, 0.68, 0.28),
  bush: new Color(0.12, 0.55, 0.22),
  berry: new Color(0.95, 0.2, 0.3),
  groundTop: new Color(0.2, 0.72, 0.25),
  groundDirt: new Color(0.68, 0.35, 0.12),
  pipeGreen: new Color(0.22, 0.72, 0.2),
  pipeHighlight: new Color(0.48, 0.88, 0.38),
  pipeShadow: new Color(0.12, 0.48, 0.12),
  brick: new Color(0.74, 0.28, 0.14),
  brickMortar: new Color(0.38, 0.14, 0.08),
  qblock: new Color(0.96, 0.68, 0.12),
  qblockBorder: new Color(0.6, 0.35, 0.05),
  qblockSpent: new Color(0.55, 0.45, 0.38),
  stoneStep: new Color(0.65, 0.62, 0.58),
  stoneDark: new Color(0.45, 0.42, 0.38),
  coin: new Color(1.0, 0.84, 0.1),
  coinShine: new Color(1.0, 0.96, 0.6),
  flagpole: new Color(0.85, 0.85, 0.85),
  flagGreen: new Color(0.15, 0.75, 0.25),
  castleWall: new Color(0.58, 0.55, 0.52),
  castleDoor: new Color(0.1, 0.1, 0.12),
  marioRed: new Color(0.88, 0.15, 0.15),
  marioBlue: new Color(0.15, 0.32, 0.85),
  marioSkin: new Color(1.0, 0.8, 0.6),
  marioBrown: new Color(0.42, 0.22, 0.1),
  goombaBrown: new Color(0.62, 0.32, 0.15),
  goombaSkin: new Color(0.95, 0.85, 0.7),
  textWhite: new Color(1, 1, 1),
  textGold: new Color(1, 0.88, 0.2),
  textShadow: new Color(0.08, 0.08, 0.1),
};

function playSfx(type: 'jump' | 'coin' | 'stomp' | 'bump' | 'win' | 'die') {
  try {
    if (type === 'jump') zzfx(0.2, 0.1, 380, 0.01, 0.08, 0.12, 0, 1.2, 8);
    else if (type === 'coin') zzfx(0.25, 0.05, 987, 0.01, 0.08, 0.18, 0, 0.4, 15);
    else if (type === 'stomp') zzfx(0.3, 0.1, 160, 0.01, 0.04, 0.12, 2, 0.5, -4);
    else if (type === 'bump') zzfx(0.2, 0.1, 120, 0.01, 0.02, 0.08, 3, 0.3, -2);
    else if (type === 'win') zzfx(0.3, 0.05, 587, 0.05, 0.2, 0.35, 0, 1.2, 8);
    else if (type === 'die') zzfx(0.35, 0.1, 200, 0.02, 0.25, 0.4, 3, 2, -10);
  } catch {
    // Audio context may not be active
  }
}

interface FloatingScore {
  text: string;
  x: number;
  y: number;
  timer: number;
}

interface PoppingCoin {
  x: number;
  y: number;
  vy: number;
  timer: number;
}

interface SquashedEnemy {
  x: number;
  y: number;
  timer: number;
}

interface RockProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rot: number;
  bounces: number;
}

/**
 * Super Mario Bros 2D Platformer (World 1-1).
 * Features:
 * - Swept AABB platforming physics, variable jump, gravity, and coyote time.
 * - Goomba enemies that patrol and can be stomped or defeat the player.
 * - Question blocks with animated coins, collectible floating coins, pipes, and staircases.
 * - Goal flagpole with flag slide, castle finish, score, timer, and full registry CRUD support.
 */
export class SuperMarioGame implements GameModule {
  readonly id: string;
  readonly title: string;
  private context?: GameContext;
  private outcome: Outcome = 'playing';
  private vx = 0;
  private vy = 0;
  private onGround = false;
  private coyoteTimer = 0;
  private facingRight = true;
  private coinsCollected = 0;
  private timeLeft = 300;
  private flagReached = false;
  private flagY = 8.0;
  private cameraX = 7;
  private animTimer = 0;

  private readonly spentBlocks = new Set<string>();
  private readonly bumpingBlocks = new Map<string, number>();
  private readonly poppingCoins: PoppingCoin[] = [];
  private readonly floatingScores: FloatingScore[] = [];
  private readonly squashedEnemies: SquashedEnemy[] = [];
  private readonly enemyDirections = new Map<string, number>();
  private readonly rocks: RockProjectile[] = [];
  private throwCooldown = 0;

  constructor(id = 'super-mario', title = 'Super Mario Bros (World 1-1)') {
    this.id = id;
    this.title = title;
  }

  init(context: GameContext): void {
    this.context = context;
    try {
      setGLEnable(false);
      setCanvasClearColor(colors.sky);
    } catch {
      // Ignored in headless mode
    }
    this.reset();
  }

  update(frame: GameFrame): void {
    if (!this.context) return;
    if (frame.restart) {
      this.context.runtime.resetGame();
      return;
    }
    const dt = Math.min(frame.deltaSeconds, 0.05);
    this.animTimer += dt;

    // Update transient visual effects
    this.updateVfx(dt);

    if (this.outcome !== 'playing') {
      if (this.flagReached && this.outcome === 'won') {
        this.updateFlagpoleCelebration(dt);
      }
      return;
    }

    const player = this.object('player-1');
    if (!player) {
      this.outcome = 'lost';
      return;
    }

    // Timer countdown
    this.timeLeft = Math.max(0, this.timeLeft - dt * 0.8);
    if (this.timeLeft <= 0) {
      this.outcome = 'lost';
      playSfx('die');
      return;
    }

    // Inspect player speed dynamically
    const pData = this.context.runtime.getEntity('player-1');
    const moveSpeed = (pData.ok && pData.data.properties.speed !== undefined)
      ? pData.data.properties.speed
      : marioConfig.playerSpeed;

    // Rock projectile throwing (press "f")
    this.throwCooldown = Math.max(0, this.throwCooldown - dt);
    const throwRequested = Boolean(frame.throwRock || (typeof keyWasPressed === 'function' && keyWasPressed('KeyF')));
    if (throwRequested && this.throwCooldown <= 0) {
      this.throwRock(player);
      this.throwCooldown = 0.25;
    }

    // Horizontal control with acceleration & friction
    const inputX = Math.max(-1, Math.min(1, frame.movement.x));
    if (inputX !== 0) {
      this.facingRight = inputX > 0;
      this.vx += inputX * marioConfig.playerAccel * dt;
      if (Math.abs(this.vx) > moveSpeed) this.vx = Math.sign(this.vx) * moveSpeed;
    } else {
      const decel = marioConfig.playerDecel * dt;
      if (Math.abs(this.vx) <= decel) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * decel;
    }

    // Jump handling: variable jump and coyote time
    if (this.onGround) this.coyoteTimer = 0.09;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

    const jumpRequested = frame.movement.y > 0.3;
    if (jumpRequested && (this.onGround || this.coyoteTimer > 0)) {
      this.vy = marioConfig.jumpSpeed;
      this.onGround = false;
      this.coyoteTimer = 0;
      playSfx('jump');
    }
    // Variable jump: cutting height if jump button released while moving up
    if (!jumpRequested && this.vy > 4) {
      this.vy *= 0.65;
    }

    // Apply gravity
    this.vy += marioConfig.gravity * dt;
    if (this.vy < marioConfig.terminalVelocity) this.vy = marioConfig.terminalVelocity;

    // Obstacle collisions (X then Y swept AABB)
    const obstacles = this.entities('obstacle');
    this.movePlayerX(player, this.vx * dt, obstacles);
    this.movePlayerY(player, this.vy * dt, obstacles);

    // Update rock projectiles
    this.updateRocks(dt, obstacles);

    // Pit death
    if (player.pos.y < marioConfig.pitDeathY) {
      this.outcome = 'lost';
      playSfx('die');
      return;
    }

    // Collectible Coins
    for (const coin of this.entities('coin')) {
      const obj = coin.object as EngineObject;
      if (this.overlaps(player, obj)) {
        this.context.runtime.deleteEntity(coin.id);
        this.coinsCollected++;
        this.addScore(100, obj.pos.x, obj.pos.y);
        playSfx('coin');
      }
    }

    // Enemies (Goombas)
    this.updateEnemies(player, obstacles, dt);

    // Flagpole win condition
    if (!this.flagReached && player.pos.x >= marioConfig.flagpoleX - 0.4) {
      this.flagReached = true;
      this.outcome = 'won';
      this.addScore(1000, marioConfig.flagpoleX, 7);
      playSfx('win');
    }

    // Camera follow
    const targetCamX = Math.max(7, Math.min(48, player.pos.x + 1.5));
    this.cameraX += (targetCamX - this.cameraX) * 0.15;
    setCameraPos(vec2(this.cameraX, 5.5));
  }

  render(): void {
    const center = mainCanvasSize.scale(0.5);

    // 1. Draw Background Clouds, Hills & Bushes in the gameRender pass
    this.renderBackground();

    // 2. Draw VFX (Popping coins, floating scores, squashed enemies)
    this.renderVfx();

    // 3. Draw Rock Projectiles
    this.renderRocks();

    // 4. Draw HUD (Screen space)
    this.renderHud(center);
  }

  reset(): void {
    if (!this.context) return;
    this.outcome = 'playing';
    this.vx = 0;
    this.vy = 0;
    this.onGround = true;
    this.coyoteTimer = 0;
    this.facingRight = true;
    this.coinsCollected = 0;
    this.timeLeft = 300;
    this.flagReached = false;
    this.flagY = 8.0;
    this.cameraX = 7;
    this.animTimer = 0;
    this.spentBlocks.clear();
    this.bumpingBlocks.clear();
    this.poppingCoins.length = 0;
    this.floatingScores.length = 0;
    this.squashedEnemies.length = 0;
    this.enemyDirections.clear();
    this.rocks.length = 0;
    this.throwCooldown = 0;
    this.context.setScore(0);

    // Create player and hook custom Mario renderer
    this.create('player-1', 'player', marioConfig.playerStart.x, marioConfig.playerStart.y, marioConfig.playerSize.x, marioConfig.playerSize.y, marioConfig.playerSpeed);
    const playerObj = this.object('player-1');
    if (playerObj) playerObj.render = () => this.drawMario(playerObj);

    // Create obstacles and hook custom block renderers
    marioConfig.blocks.forEach((block) => {
      const res = this.context!.createEntity({
        id: block.id,
        type: 'obstacle',
        dimension: '2d',
        position: { x: block.x, y: block.y },
        properties: { size: { x: block.width, y: block.height } },
      });
      if (!res.ok) throw new Error(res.error.message);
      const blockObj = this.object(block.id);
      if (blockObj) blockObj.render = () => this.drawBlock(blockObj, block);
    });

    // Create floating coins and hook coin renderer
    marioConfig.coins.forEach((coin) => {
      this.create(coin.id, 'coin', coin.x, coin.y, 0.45, 0.55);
      const coinObj = this.object(coin.id);
      if (coinObj) coinObj.render = () => this.drawCoin(coinObj);
    });

    // Create enemies and hook Goomba renderer
    marioConfig.enemies.forEach((enemy) => {
      this.create(enemy.id, 'enemy', enemy.x, enemy.y, 0.8, 0.8, enemy.speed);
      this.enemyDirections.set(enemy.id, -1);
      const enemyObj = this.object(enemy.id);
      if (enemyObj) enemyObj.render = () => this.drawGoomba(enemyObj);
    });

    setCameraPos(vec2(7, 5.5));
  }

  destroy(): void {
    this.context = undefined;
  }

  getState(): GameModuleState {
    const player = this.context?.runtime.getEntity('player-1');
    const pos = player?.ok ? player.data.position : marioConfig.playerStart;
    return {
      outcome: this.outcome,
      coins: this.coinsCollected,
      score: this.context?.getScore() ?? 0,
      timeLeft: Math.round(this.timeLeft),
      playerX: Number(pos.x.toFixed(2)),
      playerY: Number(pos.y.toFixed(2)),
      enemiesRemaining: this.entities('enemy').length,
      flagReached: this.flagReached,
    };
  }

  private create(id: string, type: EntityType, x: number, y: number, w: number, h: number, speed?: number): void {
    const res = this.context?.createEntity({
      id,
      type,
      dimension: '2d',
      position: { x, y },
      properties: { size: { x: w, y: h }, ...(speed !== undefined ? { speed } : {}) },
    });
    if (!res?.ok) throw new Error(res?.error.message ?? `Failed to create entity ${id}`);
  }

  private object(id: string): EngineObject | undefined {
    return this.context?.getObject<EngineObject>(id);
  }

  private entities(type: EntityType): ManagedEntity[] {
    return this.context?.registry.list().filter((e) => e.type === type && e.dimension === '2d') ?? [];
  }

  private overlaps(a: EngineObject, b: EngineObject): boolean {
    return (
      Math.abs(a.pos.x - b.pos.x) < (a.size.x + b.size.x) / 2 &&
      Math.abs(a.pos.y - b.pos.y) < (a.size.y + b.size.y) / 2
    );
  }

  private movePlayerX(player: EngineObject, dx: number, obstacles: ManagedEntity[]): void {
    player.pos = player.pos.add(vec2(dx, 0));
    for (const obs of obstacles) {
      if (obs.id === 'flagpole') continue;
      const wall = obs.object as EngineObject;
      if (this.overlaps(player, wall)) {
        if (dx > 0) player.pos = vec2(wall.pos.x - (wall.size.x + player.size.x) / 2, player.pos.y);
        else if (dx < 0) player.pos = vec2(wall.pos.x + (wall.size.x + player.size.x) / 2, player.pos.y);
        this.vx = 0;
      }
    }
    // Prevent walking left past the level start
    if (player.pos.x < marioConfig.levelStartX + player.size.x / 2) {
      player.pos = vec2(marioConfig.levelStartX + player.size.x / 2, player.pos.y);
      this.vx = 0;
    }
  }

  private movePlayerY(player: EngineObject, dy: number, obstacles: ManagedEntity[]): void {
    this.onGround = false;
    player.pos = player.pos.add(vec2(0, dy));
    for (const obs of obstacles) {
      if (obs.id === 'flagpole') continue;
      const wall = obs.object as EngineObject;
      if (this.overlaps(player, wall)) {
        if (dy < 0) {
          // Landed on top
          player.pos = vec2(player.pos.x, wall.pos.y + (wall.size.y + player.size.y) / 2);
          this.vy = 0;
          this.onGround = true;
        } else if (dy > 0) {
          // Bonked from bottom
          player.pos = vec2(player.pos.x, wall.pos.y - (wall.size.y + player.size.y) / 2);
          this.vy = 0;
          this.hitBlock(obs.id, wall.pos.x, wall.pos.y);
        }
      }
    }
  }

  private hitBlock(blockId: string, x: number, y: number): void {
    this.bumpingBlocks.set(blockId, 0.15);
    playSfx('bump');
    if (!this.spentBlocks.has(blockId)) {
      const blockDef = marioConfig.blocks.find((b) => b.id === blockId);
      if (blockDef?.hasCoin) {
        this.spentBlocks.add(blockId);
        this.coinsCollected++;
        this.addScore(100, x, y + 1.2);
        this.poppingCoins.push({ x, y: y + 0.6, vy: 7, timer: 0.5 });
        playSfx('coin');
      }
    }
  }

  private updateEnemies(player: EngineObject, obstacles: ManagedEntity[], dt: number): void {
    for (const enemy of this.entities('enemy')) {
      const obj = enemy.object as EngineObject;
      let dir = this.enemyDirections.get(enemy.id) ?? -1;
      const speed = enemy.getSpeed();
      const nextX = obj.pos.x + dir * speed * dt;

      // Check obstacle bounce for enemy
      let blocked = false;
      for (const obs of obstacles) {
        if (obs.id === 'flagpole') continue;
        const o = obs.object as EngineObject;
        if (Math.abs(obj.pos.y - o.pos.y) < (obj.size.y + o.size.y) / 2 - 0.05) {
          const minX = o.pos.x - (o.size.x + obj.size.x) / 2;
          const maxX = o.pos.x + (o.size.x + obj.size.x) / 2;
          if ((dir > 0 && nextX > minX && obj.pos.x <= minX) || (dir < 0 && nextX < maxX && obj.pos.x >= maxX)) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) {
        dir = -dir;
        this.enemyDirections.set(enemy.id, dir);
      } else {
        obj.pos = vec2(nextX, obj.pos.y);
      }

      // Check collision with player
      if (this.overlaps(player, obj)) {
        const playerBottom = player.pos.y - player.size.y / 2;
        const enemyTop = obj.pos.y + obj.size.y / 2;
        if (this.vy < 0 && playerBottom >= enemyTop - 0.35) {
          // Stomped enemy!
          this.context?.runtime.deleteEntity(enemy.id);
          this.vy = 8.5; // Mario bounce
          this.addScore(200, obj.pos.x, obj.pos.y + 0.6);
          this.squashedEnemies.push({ x: obj.pos.x, y: obj.pos.y - 0.2, timer: 0.45 });
          playSfx('stomp');
        } else {
          // Mario took damage
          this.outcome = 'lost';
          playSfx('die');
        }
      }
    }
  }

  private updateFlagpoleCelebration(dt: number): void {
    if (this.flagY > 2.0) this.flagY -= 6 * dt;
    const player = this.object('player-1');
    if (player && player.pos.x < marioConfig.castleDoorX) {
      player.pos = vec2(player.pos.x + 2.5 * dt, 1.45);
      this.facingRight = true;
    }
  }

  private updateVfx(dt: number): void {
    // Block bumps
    for (const [id, time] of this.bumpingBlocks.entries()) {
      const remaining = time - dt;
      if (remaining <= 0) this.bumpingBlocks.delete(id);
      else this.bumpingBlocks.set(id, remaining);
    }
    // Popping coins
    for (let i = this.poppingCoins.length - 1; i >= 0; i--) {
      const coin = this.poppingCoins[i];
      coin.y += coin.vy * dt;
      coin.vy -= 22 * dt;
      coin.timer -= dt;
      if (coin.timer <= 0) this.poppingCoins.splice(i, 1);
    }
    // Floating scores
    for (let i = this.floatingScores.length - 1; i >= 0; i--) {
      const score = this.floatingScores[i];
      score.y += 1.5 * dt;
      score.timer -= dt;
      if (score.timer <= 0) this.floatingScores.splice(i, 1);
    }
    // Squashed enemies
    for (let i = this.squashedEnemies.length - 1; i >= 0; i--) {
      const sq = this.squashedEnemies[i];
      sq.timer -= dt;
      if (sq.timer <= 0) this.squashedEnemies.splice(i, 1);
    }
  }

  private addScore(amount: number, x: number, y: number): void {
    if (this.context) {
      this.context.setScore(this.context.getScore() + amount);
    }
    this.floatingScores.push({ text: `+${amount}`, x, y, timer: 0.8 });
  }

  // --- ENTITY RENDERERS (CALLED BY LittleJS EngineObject.render) ---

  private drawMario(player: EngineObject): void {
    const pos = player.pos;
    const dir = this.facingRight ? 1 : -1;
    const isMoving = Math.abs(this.vx) > 0.3 && this.onGround;
    const legOffset = isMoving ? Math.sin(this.animTimer * 14) * 0.14 : 0;

    // Red Cap & Visor
    drawCircle(vec2(pos.x, pos.y + 0.3), 0.6, colors.marioRed);
    drawRect(vec2(pos.x + dir * 0.18, pos.y + 0.3), vec2(0.24, 0.12), colors.marioRed);

    // Face & Nose
    drawCircle(vec2(pos.x + dir * 0.04, pos.y + 0.14), 0.44, colors.marioSkin);
    drawCircle(vec2(pos.x + dir * 0.2, pos.y + 0.14), 0.18, colors.marioSkin);

    // Eye & Mustache
    drawCircle(vec2(pos.x + dir * 0.1, pos.y + 0.18), 0.08, colors.textShadow);
    drawRect(vec2(pos.x + dir * 0.15, pos.y + 0.09), vec2(0.22, 0.08), colors.marioBrown);

    // Blue Overalls & Red Shirt
    drawRect(vec2(pos.x, pos.y - 0.08), vec2(0.42, 0.3), colors.marioBlue);
    drawRect(vec2(pos.x - dir * 0.18, pos.y - 0.02), vec2(0.14, 0.22), colors.marioRed);
    // Yellow overall buttons
    drawCircle(vec2(pos.x + dir * 0.08, pos.y - 0.02), 0.08, colors.coin);

    // Shoes
    if (!this.onGround) {
      // Jumping pose: legs bent
      drawCircle(vec2(pos.x - dir * 0.16, pos.y - 0.3), 0.26, colors.marioBrown);
      drawCircle(vec2(pos.x + dir * 0.12, pos.y - 0.26), 0.26, colors.marioBrown);
    } else {
      // Running / standing legs
      drawCircle(vec2(pos.x - 0.16 + legOffset, pos.y - 0.36), 0.24, colors.marioBrown);
      drawCircle(vec2(pos.x + 0.16 - legOffset, pos.y - 0.36), 0.24, colors.marioBrown);
    }
  }

  private drawGoomba(enemy: EngineObject): void {
    const pos = enemy.pos;
    const waddle = Math.sin(this.animTimer * 10) * 0.05;

    // Brown mushroom dome
    drawCircle(vec2(pos.x, pos.y + 0.12), 0.76, colors.goombaBrown);
    drawRect(vec2(pos.x, pos.y - 0.08), vec2(0.5, 0.25), colors.goombaSkin);

    // Slanted eyes
    drawCircle(vec2(pos.x - 0.12, pos.y - 0.04), 0.16, colors.textWhite);
    drawCircle(vec2(pos.x + 0.12, pos.y - 0.04), 0.16, colors.textWhite);
    drawCircle(vec2(pos.x - 0.1, pos.y - 0.04), 0.08, colors.textShadow);
    drawCircle(vec2(pos.x + 0.14, pos.y - 0.04), 0.08, colors.textShadow);

    // Feet waddling
    drawCircle(vec2(pos.x - 0.2, pos.y - 0.35 + waddle), 0.24, colors.textShadow);
    drawCircle(vec2(pos.x + 0.2, pos.y - 0.35 - waddle), 0.24, colors.textShadow);
  }

  private drawBlock(obj: EngineObject, block: BlockDef): void {
    let bumpY = 0;
    const bumpTimer = this.bumpingBlocks.get(block.id);
    if (bumpTimer !== undefined) {
      bumpY = Math.sin((bumpTimer / 0.15) * Math.PI) * 0.35;
    }
    const pos = vec2(obj.pos.x, obj.pos.y + bumpY);
    const size = obj.size;

    if (block.kind === 'ground') {
      drawRect(pos, size, colors.groundDirt);
      drawRect(vec2(pos.x, pos.y + size.y / 2 - 0.1), vec2(size.x, 0.2), colors.groundTop);
    } else if (block.kind === 'pipe') {
      // Pipe body
      drawRect(pos, size, colors.pipeGreen);
      drawRect(vec2(pos.x - size.x * 0.35, pos.y), vec2(size.x * 0.2, size.y), colors.pipeHighlight);
      drawRect(vec2(pos.x + size.x * 0.35, pos.y), vec2(size.x * 0.2, size.y), colors.pipeShadow);
      // Pipe rim
      const rimPos = vec2(pos.x, pos.y + size.y / 2 - 0.2);
      const rimSize = vec2(size.x + 0.2, 0.4);
      drawRect(rimPos, rimSize, colors.pipeGreen);
      drawRect(vec2(rimPos.x - rimSize.x * 0.35, rimPos.y), vec2(rimSize.x * 0.2, rimSize.y), colors.pipeHighlight);
    } else if (block.kind === 'brick') {
      drawRect(pos, size, colors.brick);
      drawRect(pos, vec2(size.x - 0.1, size.y - 0.1), colors.brickMortar);
      drawRect(vec2(pos.x - 0.2, pos.y), vec2(size.x * 0.35, size.y * 0.35), colors.brick);
      drawRect(vec2(pos.x + 0.2, pos.y), vec2(size.x * 0.35, size.y * 0.35), colors.brick);
    } else if (block.kind === 'question') {
      const isSpent = this.spentBlocks.has(block.id);
      drawRect(pos, size, isSpent ? colors.qblockSpent : colors.qblockBorder);
      drawRect(pos, vec2(size.x - 0.12, size.y - 0.12), isSpent ? colors.stoneDark : colors.qblock);
      if (!isSpent) {
        drawCircle(vec2(pos.x - 0.32, pos.y - 0.32), 0.1, colors.qblockBorder);
        drawCircle(vec2(pos.x + 0.32, pos.y - 0.32), 0.1, colors.qblockBorder);
        drawCircle(vec2(pos.x - 0.32, pos.y + 0.32), 0.1, colors.qblockBorder);
        drawCircle(vec2(pos.x + 0.32, pos.y + 0.32), 0.1, colors.qblockBorder);
        drawText('?', pos, 0.55, colors.textWhite, 0.05, colors.textShadow);
      }
    } else if (block.kind === 'step') {
      drawRect(pos, size, colors.stoneStep);
      drawRect(vec2(pos.x, pos.y - size.y / 2 + 0.05), vec2(size.x, 0.1), colors.stoneDark);
    } else if (block.kind === 'flagpole') {
      drawRect(pos, size, colors.flagpole);
      drawCircle(vec2(pos.x, pos.y + size.y / 2 + 0.15), 0.5, colors.coin);
      const flagCenter = vec2(pos.x - 0.6, this.flagY);
      drawRect(flagCenter, vec2(1.0, 0.7), colors.flagGreen);
    } else if (block.kind === 'castle') {
      drawRect(pos, size, colors.castleWall);
      drawRect(vec2(pos.x - 1.2, pos.y + size.y / 2 + 0.3), vec2(0.6, 0.6), colors.castleWall);
      drawRect(vec2(pos.x, pos.y + size.y / 2 + 0.3), vec2(0.6, 0.6), colors.castleWall);
      drawRect(vec2(pos.x + 1.2, pos.y + size.y / 2 + 0.3), vec2(0.6, 0.6), colors.castleWall);
      drawRect(vec2(pos.x, pos.y - size.y / 2 + 0.75), vec2(1.1, 1.5), colors.castleDoor);
      drawCircle(vec2(pos.x, pos.y - size.y / 2 + 1.5), 1.1, colors.castleDoor);
    }
  }

  private drawCoin(coin: EngineObject): void {
    const coinBob = Math.sin(this.animTimer * 5) * 0.08;
    const pos = vec2(coin.pos.x, coin.pos.y + coinBob);
    drawCircle(pos, 0.55, colors.coin);
    drawCircle(pos, 0.32, colors.coinShine);
    drawRect(pos, vec2(0.06, 0.24), colors.textShadow);
  }

  // --- BACKGROUND & HUD (CALLED IN gameRender) ---

  private renderBackground(): void {
    // Sky clear color handles the backdrop; draw fluffy clouds
    const cloudPositions = [4, 12, 22, 33, 44, 52];
    for (const cx of cloudPositions) {
      const cy = 8.5 + Math.sin(cx) * 0.8;
      drawCircle(vec2(cx, cy), 2.2, colors.cloud);
      drawCircle(vec2(cx - 0.8, cy - 0.2), 1.6, colors.cloud);
      drawCircle(vec2(cx + 0.8, cy - 0.2), 1.7, colors.cloud);
      drawRect(vec2(cx, cy - 0.35), vec2(2.2, 0.6), colors.cloud);
    }

    // Rolling green hills
    const hillPositions = [6, 17, 26, 37, 49];
    for (const hx of hillPositions) {
      drawCircle(vec2(hx, 1.8), 2.2, colors.hill);
      // Bushes with red berries
      drawCircle(vec2(hx + 2.5, 1.3), 1.0, colors.bush);
      drawCircle(vec2(hx + 2.7, 1.45), 0.2, colors.berry);
    }
  }

  private renderVfx(): void {
    // Popping coins
    for (const coin of this.poppingCoins) {
      drawCircle(vec2(coin.x, coin.y), 0.55, colors.coin);
      drawCircle(vec2(coin.x, coin.y), 0.32, colors.coinShine);
    }
    // Squashed enemies
    for (const sq of this.squashedEnemies) {
      drawRect(vec2(sq.x, sq.y), vec2(0.8, 0.2), colors.goombaBrown);
      drawCircle(vec2(sq.x - 0.15, sq.y), 0.12, colors.textWhite);
      drawCircle(vec2(sq.x + 0.15, sq.y), 0.12, colors.textWhite);
    }
    // Floating score popups
    for (const s of this.floatingScores) {
      drawText(s.text, vec2(s.x, s.y), 0.42, colors.textGold, 0.05, colors.textShadow);
    }
  }

  private throwRock(player: EngineObject): void {
    const dir = this.facingRight ? 1 : -1;
    this.rocks.push({
      x: player.pos.x + dir * 0.5,
      y: player.pos.y + 0.1,
      vx: dir * 12,
      vy: 4,
      radius: 0.22,
      rot: 0,
      bounces: 0,
    });
    playSfx('bump');
  }

  private updateRocks(dt: number, obstacles: ManagedEntity[]): void {
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const rock = this.rocks[i];
      let destroyed = false;

      // Apply gravity
      rock.vy += marioConfig.gravity * dt;
      if (rock.vy < marioConfig.terminalVelocity) {
        rock.vy = marioConfig.terminalVelocity;
      }

      // Advance horizontal position
      rock.x += rock.vx * dt;
      rock.rot += rock.vx * dt * 4;

      // Horizontal obstacle collisions
      for (const obs of obstacles) {
        if (obs.id === 'flagpole') continue;
        const wall = obs.object as EngineObject;
        const halfW = wall.size.x / 2 + rock.radius;
        const halfH = wall.size.y / 2 + rock.radius;
        if (Math.abs(rock.x - wall.pos.x) < halfW && Math.abs(rock.y - wall.pos.y) < halfH - 0.08) {
          destroyed = true;
          playSfx('bump');
          break;
        }
      }
      if (destroyed) {
        this.rocks.splice(i, 1);
        continue;
      }

      // Advance vertical position
      rock.y += rock.vy * dt;

      // Vertical obstacle collisions
      for (const obs of obstacles) {
        if (obs.id === 'flagpole') continue;
        const wall = obs.object as EngineObject;
        const halfW = wall.size.x / 2 + rock.radius;
        const halfH = wall.size.y / 2 + rock.radius;
        if (Math.abs(rock.x - wall.pos.x) < halfW && Math.abs(rock.y - wall.pos.y) < halfH) {
          if (rock.vy < 0) {
            // Landed on surface -> bounce!
            rock.y = wall.pos.y + wall.size.y / 2 + rock.radius;
            rock.bounces++;
            if (rock.bounces > 4) {
              destroyed = true;
            } else {
              rock.vy = 5;
              playSfx('bump');
            }
          } else {
            destroyed = true;
            playSfx('bump');
          }
          break;
        }
      }
      if (destroyed) {
        this.rocks.splice(i, 1);
        continue;
      }

      // Check collision with Goomba enemies
      for (const enemy of this.entities('enemy')) {
        const enemyObj = enemy.object as EngineObject;
        const hitX = enemyObj.size.x / 2 + rock.radius;
        const hitY = enemyObj.size.y / 2 + rock.radius;
        if (Math.abs(rock.x - enemyObj.pos.x) < hitX && Math.abs(rock.y - enemyObj.pos.y) < hitY) {
          this.context?.runtime.deleteEntity(enemy.id);
          this.addScore(200, enemyObj.pos.x, enemyObj.pos.y + 0.6);
          this.squashedEnemies.push({ x: enemyObj.pos.x, y: enemyObj.pos.y - 0.2, timer: 0.45 });
          playSfx('stomp');
          destroyed = true;
          break;
        }
      }
      if (destroyed) {
        this.rocks.splice(i, 1);
        continue;
      }

      // Out of bounds / pit
      if (rock.y < marioConfig.pitDeathY || Math.abs(rock.x - this.cameraX) > 22) {
        this.rocks.splice(i, 1);
      }
    }
  }

  private renderRocks(): void {
    for (const rock of this.rocks) {
      const pos = vec2(rock.x, rock.y);
      const cosR = Math.cos(rock.rot);
      const sinR = Math.sin(rock.rot);
      drawCircle(pos, rock.radius, colors.stoneDark);
      drawCircle(
        pos.add(vec2(-0.06 * cosR - 0.04 * sinR, -0.06 * sinR + 0.04 * cosR)),
        rock.radius * 0.65,
        colors.stoneStep,
      );
      drawCircle(
        pos.add(vec2(0.08 * cosR - 0.05 * sinR, 0.08 * sinR + 0.05 * cosR)),
        rock.radius * 0.35,
        colors.textShadow,
      );
    }
  }

  private renderHud(center: ReturnType<typeof vec2>): void {
    // Top Arcade HUD Bar
    const hudY = 24;
    const scoreStr = String(this.context?.getScore() ?? 0).padStart(6, '0');
    const coinStr = String(this.coinsCollected).padStart(2, '0');
    const timeStr = String(Math.round(this.timeLeft)).padStart(3, '0');

    drawTextScreen(`MARIO`, vec2(center.x - 280, hudY), 16, colors.textWhite, 2, colors.textShadow);
    drawTextScreen(scoreStr, vec2(center.x - 280, hudY + 18), 16, colors.textGold, 2, colors.textShadow);

    drawTextScreen(`COINS`, vec2(center.x - 90, hudY), 16, colors.textWhite, 2, colors.textShadow);
    drawTextScreen(`* ${coinStr}`, vec2(center.x - 90, hudY + 18), 16, colors.textGold, 2, colors.textShadow);

    drawTextScreen(`WORLD`, vec2(center.x + 100, hudY), 16, colors.textWhite, 2, colors.textShadow);
    drawTextScreen(`1-1`, vec2(center.x + 100, hudY + 18), 16, colors.textWhite, 2, colors.textShadow);

    drawTextScreen(`TIME`, vec2(center.x + 270, hudY), 16, colors.textWhite, 2, colors.textShadow);
    drawTextScreen(timeStr, vec2(center.x + 270, hudY + 18), 16, colors.textGold, 2, colors.textShadow);

    // Instructions footer
    drawTextScreen(
      'Move: A/D or Left/Right   Jump: W/Up/Space   Throw: F   Restart: R',
      vec2(center.x, mainCanvasSize.y - 22),
      15,
      colors.textWhite,
      2,
      colors.textShadow,
    );

    // Win / Loss Game Banner Overlay
    if (this.outcome === 'won') {
      drawTextScreen('COURSE CLEAR! YOU WIN!', vec2(center.x, 82), 26, colors.textGold, 3, colors.textShadow);
      drawTextScreen('Press R to play again', vec2(center.x, 114), 18, colors.textWhite, 2, colors.textShadow);
    } else if (this.outcome === 'lost') {
      drawTextScreen('GAME OVER', vec2(center.x, 82), 28, colors.marioRed, 3, colors.textShadow);
      drawTextScreen('Press R to retry', vec2(center.x, 114), 18, colors.textWhite, 2, colors.textShadow);
    }
  }
}

export const superMarioGame = new SuperMarioGame('super-mario', 'Super Mario Bros (World 1-1)');
