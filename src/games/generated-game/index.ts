import { GeneratedGame } from '../../studio/generatedGame';
import { compilePrompt, examples } from '../../studio/spec';
export const generatedGame = new GeneratedGame(compilePrompt(examples[0].prompt));
