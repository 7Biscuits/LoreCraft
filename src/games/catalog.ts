import type { GameModule } from './contract';
import { validateGameModule } from './contract';
import { gameCatalog } from './manifest';

const modules = import.meta.glob('./*/index.ts');

export async function loadGame(id: string): Promise<GameModule> {
  const entry = gameCatalog.find((game) => game.id === id);
  if (!entry) throw new Error(`Unknown game "${id}". Register it in src/games/manifest.ts.`);
  const load = modules[entry.entry];
  if (!load) throw new Error(`Game source is missing: ${entry.entry}`);
  const exports = await load() as Record<string, unknown>;
  const game = exports[entry.exportName];
  if (!game || typeof game !== 'object') throw new Error(`Missing game export "${entry.exportName}" for ${id}.`);
  const validation = validateGameModule(game);
  if (!validation.ok || (game as GameModule).id !== id) {
    throw new Error(`Invalid game "${id}": ${validation.errors.join(' ')} Module id must match the manifest.`);
  }
  return game as GameModule;
}
