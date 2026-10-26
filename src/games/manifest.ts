/** Node reads metadata only; LittleJS game modules are loaded by the browser. */
export const gameCatalog: readonly { id: string; title: string; entry: string; exportName: string }[] = [
  { id: 'maze-escape', title: 'Maze Escape', entry: './maze-escape/index.ts', exportName: 'mazeEscapeGame' },
];

export const defaultGameId = 'maze-escape';
