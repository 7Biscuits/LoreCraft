export interface BlockDef {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'ground' | 'brick' | 'question' | 'pipe' | 'step' | 'flagpole' | 'castle';
  hasCoin?: boolean;
}

export interface EnemyDef {
  id: string;
  x: number;
  y: number;
  speed: number;
  type: 'goomba';
}

export interface CoinDef {
  id: string;
  x: number;
  y: number;
}

export const marioConfig = {
  gravity: -26,
  terminalVelocity: -16,
  jumpSpeed: 12,
  playerSpeed: 7,
  playerAccel: 32,
  playerDecel: 24,
  playerStart: { x: 2, y: 1.45 },
  playerSize: { x: 0.8, y: 0.9 },

  // World bounds
  levelStartX: 0,
  levelEndX: 55,
  pitDeathY: -3,

  // Flag & Finish
  flagpoleX: 47.5,
  flagpoleBottomY: 1.5,
  flagpoleTopY: 8.5,
  castleDoorX: 51.5,

  // Level blocks & obstacles
  blocks: [
    // Ground segment 1 (x: 0 to 14)
    { id: 'ground-1', x: 7, y: 0.5, width: 16, height: 1, kind: 'ground' },

    // Question & Brick blocks in section 1
    { id: 'qblock-1', x: 4, y: 3.5, width: 0.9, height: 0.9, kind: 'question', hasCoin: true },
    { id: 'brick-1', x: 6.5, y: 3.5, width: 0.9, height: 0.9, kind: 'brick' },
    { id: 'qblock-2', x: 7.5, y: 3.5, width: 0.9, height: 0.9, kind: 'question', hasCoin: true },
    { id: 'brick-2', x: 8.5, y: 3.5, width: 0.9, height: 0.9, kind: 'brick' },
    { id: 'qblock-3', x: 7.5, y: 6.5, width: 0.9, height: 0.9, kind: 'question', hasCoin: true },

    // Pipe 1 (Small green pipe)
    { id: 'pipe-1', x: 12.5, y: 1.75, width: 1.3, height: 1.5, kind: 'pipe' },

    // Ground segment 2 (x: 16.5 to 32)
    { id: 'ground-2', x: 24.25, y: 0.5, width: 15.5, height: 1, kind: 'ground' },

    // Section 2 blocks & pipe
    { id: 'brick-3', x: 18.5, y: 3.8, width: 0.9, height: 0.9, kind: 'brick' },
    { id: 'qblock-4', x: 19.5, y: 3.8, width: 0.9, height: 0.9, kind: 'question', hasCoin: true },
    { id: 'brick-4', x: 20.5, y: 3.8, width: 0.9, height: 0.9, kind: 'brick' },

    // Pipe 2 (Tall green pipe)
    { id: 'pipe-2', x: 23.5, y: 2.25, width: 1.3, height: 2.5, kind: 'pipe' },

    // High platform in section 2
    { id: 'plat-1', x: 28, y: 4.2, width: 3.2, height: 0.6, kind: 'brick' },
    { id: 'qblock-5', x: 28, y: 7.0, width: 0.9, height: 0.9, kind: 'question', hasCoin: true },

    // Ground segment 3 (x: 34.5 to 55)
    { id: 'ground-3', x: 44.75, y: 0.5, width: 20.5, height: 1, kind: 'ground' },

    // Pipe 3
    { id: 'pipe-3', x: 37, y: 1.75, width: 1.3, height: 1.5, kind: 'pipe' },

    // Stepped staircase leading up to flagpole
    { id: 'step-1', x: 41.5, y: 1.5, width: 1.0, height: 1.0, kind: 'step' },
    { id: 'step-2', x: 42.5, y: 2.0, width: 1.0, height: 2.0, kind: 'step' },
    { id: 'step-3', x: 43.5, y: 2.5, width: 1.0, height: 3.0, kind: 'step' },
    { id: 'step-4', x: 44.5, y: 3.0, width: 1.0, height: 4.0, kind: 'step' },

    // Flagpole base and post
    { id: 'flag-base', x: 47.5, y: 1.5, width: 1.0, height: 1.0, kind: 'step' },
    { id: 'flagpole', x: 47.5, y: 5.0, width: 0.25, height: 7.0, kind: 'flagpole' },

    // Castle structure
    { id: 'castle', x: 52, y: 2.5, width: 3.5, height: 3.0, kind: 'castle' },
  ] as BlockDef[],

  // Coins in the open air
  coins: [
    { id: 'coin-1', x: 4, y: 4.8 },
    { id: 'coin-2', x: 10, y: 2.2 },
    // Coins over pit 1
    { id: 'coin-3', x: 14.5, y: 3.2 },
    { id: 'coin-4', x: 15.3, y: 3.8 },
    { id: 'coin-5', x: 16.1, y: 3.2 },
    // Coins near pipe 2 and platform
    { id: 'coin-6', x: 23.5, y: 4.2 },
    { id: 'coin-7', x: 27.2, y: 5.2 },
    { id: 'coin-8', x: 28.0, y: 5.2 },
    { id: 'coin-9', x: 28.8, y: 5.2 },
    // Coins over pit 2
    { id: 'coin-10', x: 33.3, y: 2.8 },
    // Coins near stairs
    { id: 'coin-11', x: 42.5, y: 3.8 },
    { id: 'coin-12', x: 44.5, y: 4.8 },
  ] as CoinDef[],

  // Goombas patrolling
  enemies: [
    { id: 'enemy-1', x: 9.0, y: 1.4, speed: 1.6, type: 'goomba' },
    { id: 'enemy-2', x: 13.5, y: 1.4, speed: 1.8, type: 'goomba' },
    { id: 'enemy-3', x: 20.0, y: 1.4, speed: 1.7, type: 'goomba' },
    { id: 'enemy-4', x: 26.5, y: 1.4, speed: 1.9, type: 'goomba' },
    { id: 'enemy-5', x: 31.0, y: 1.4, speed: 1.6, type: 'goomba' },
    { id: 'enemy-6', x: 40.0, y: 1.4, speed: 1.8, type: 'goomba' },
  ] as EnemyDef[],
} as const;
