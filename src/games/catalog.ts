import type { GameModule } from './contract';
import { mazeEscapeGame } from './maze-escape';

/** Select the authored module that Vite loads. Future lifecycle work can reload this selection. */
export const activeGame: GameModule = mazeEscapeGame;
