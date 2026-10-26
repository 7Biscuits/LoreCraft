/** Node reads metadata only; LittleJS game modules are loaded by the browser. */
export const gameCatalog: readonly { id: string; title: string; entry: string; exportName: string }[] = [
  { id: 'ken-vs-ryu', title: 'Ken vs. Ryu — Arcade Duel', entry: './ken-vs-ryu/index.ts', exportName: 'arcadeDuelGame' },
  { id: 'starter-town', title: 'Starter Town', entry: './starter-town/index.ts', exportName: 'starterTownGame' },
  { id: 'endless-racer', title: 'Endless Racer', entry: './endless-racer/index.ts', exportName: 'endlessRacerGame' },
  { id: 'happy-flappy', title: 'Happy Flappy', entry: './happy-flappy/index.ts', exportName: 'happyFlappyGame' },
  { id: 'maze-escape', title: 'Maze Escape', entry: './maze-escape/index.ts', exportName: 'mazeEscapeGame' },
  { id: 'generated-game', title: 'Moonlit Grove', entry: './generated-game/index.ts', exportName: 'generatedGame' },
  { id: 'super-mario', title: 'Super Mario Bros (World 1-1)', entry: './super-mario/index.ts', exportName: 'superMarioGame' },
];

export const defaultGameId = 'maze-escape';
