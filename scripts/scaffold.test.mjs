import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldGame } from './scaffold.mjs';

test('scaffolder creates a registered authored module and refuses unsafe or existing IDs', () => {
  const root = mkdtempSync(join(tmpdir(), 'lorecraft-scaffold-'));
  try {
    mkdirSync(join(root, 'src/games'), { recursive: true });
    writeFileSync(join(root, 'src/games/manifest.ts'), 'export const gameCatalog = [\n];\n');
    assert.throws(() => scaffoldGame('../escape', 'forest adventure', root), /game ID/);
    const directory = scaffoldGame('test-world', 'a space shooter with 4 enemies', root);
    assert.match(readFileSync(join(directory, 'index.ts'), 'utf8'), /new GeneratedGame\(spec, 'test-world'\)/);
    assert.match(readFileSync(join(root, 'src/games/manifest.ts'), 'utf8'), /id: 'test-world'/);
    assert.throws(() => scaffoldGame('test-world', 'forest adventure', root), /already exists/);
  } finally { rmSync(root, { recursive: true }); }
});
