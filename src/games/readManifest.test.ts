import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGameCatalog } from './readManifest';

test('catalog refresh discovers newly authored games without executing source or restarting MCP', () => {
  const root = mkdtempSync(join(tmpdir(), 'lorecraft-manifest-'));
  try {
    mkdirSync(join(root, 'src/games'), { recursive: true });
    const file = join(root, 'src/games/manifest.ts');
    writeFileSync(file, `throw new Error('must not execute');\nexport const gameCatalog = [\n{ id: 'first', title: 'First', entry: './first/index.ts', exportName: 'game' },\n];`);
    assert.equal(readGameCatalog(root).length, 1);
    writeFileSync(file, `export const gameCatalog = [\n{ id: 'new-game', title: "New Game", entry: './new-game/index.ts', exportName: 'newGame' },\n];`);
    assert.equal(readGameCatalog(root)[0]!.id, 'new-game');
    writeFileSync(file, `export const gameCatalog = [\n{ id: '../escape', title: 'Bad', entry: './bad/index.ts', exportName: 'game' },\n];`);
    assert.throws(() => readGameCatalog(root), /Invalid game/);
  } finally { rmSync(root, { recursive: true }); }
});
