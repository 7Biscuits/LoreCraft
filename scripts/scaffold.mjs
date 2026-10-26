import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compilePrompt } from '../src/studio/spec.ts';

export function scaffoldGame(id, prompt, root = fileURLToPath(new URL('../', import.meta.url))) {
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(id)) throw new Error('Use a 2–40 character lowercase game ID, starting with a letter.');
  if (typeof prompt !== 'string' || prompt.trim().length < 3 || prompt.length > 4000) throw new Error('Supply a 3–4,000 character game prompt.');
  const directory = join(root, 'src/games', id), manifestPath = join(root, 'src/games/manifest.ts');
  const manifest = readFileSync(manifestPath, 'utf8');
  if (existsSync(directory) || manifest.includes(`id: '${id}'`)) throw new Error(`Game ${id} already exists. Existing games are never overwritten.`);
  if (!manifest.includes('\n];')) throw new Error('Manifest format was not recognized. No files were changed.');
  const spec = compilePrompt(prompt);
  mkdirSync(directory); mkdirSync(join(directory, 'assets'));
  writeFileSync(join(directory, 'config.ts'), `import type { GameSpec } from '../../studio/spec';\n\nexport const spec = ${JSON.stringify(spec, null, 2)} satisfies GameSpec;\n`, { flag: 'wx' });
  writeFileSync(join(directory, 'index.ts'), `import { GeneratedGame } from '../../studio/generatedGame';\nimport { spec } from './config';\n\nexport const game = new GeneratedGame(spec, '${id}');\n`, { flag: 'wx' });
  writeFileSync(join(directory, 'assets/README.md'), '# Game assets\n\nKeep this game’s art, sound, and level data here. Use relative imports. The default game renders procedural art and needs no remote assets.\n', { flag: 'wx' });
  const entry = `  { id: '${id}', title: ${JSON.stringify(spec.title)}, entry: './${id}/index.ts', exportName: 'game' },`;
  writeFileSync(manifestPath, manifest.replace('\n];', `\n${entry}\n];`));
  return directory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(`Created and registered ${scaffoldGame(process.argv[2], process.argv.slice(3).join(' '))}. Run pnpm typecheck and restart MCP to refresh its catalog.`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
