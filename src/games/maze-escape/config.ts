export const mazeConfig = {
  halfSize: 8,
  playerSpeed: 5,
  enemySpeed: 2.2,
  playerStart: { x: -6.5, y: -6.5 },
  enemyStart: { x: 6.25, y: -5.75 },
  keyPosition: { x: -5.5, y: 5.5 },
  exitPosition: { x: 6.5, y: 6.5 },
  walls: [
    { x: -3, y: -4, width: 1, height: 7 },
    { x: 1, y: -1, width: 7, height: 1 },
    { x: 3.5, y: 3, width: 1, height: 7 },
    { x: -1, y: 5, width: 7, height: 1 },
  ],
} as const;
