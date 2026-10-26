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

test('literal metadata supports punctuation, escapes, comments and TypeScript assertions', () => {
  const root = mkdtempSync(join(tmpdir(), 'lorecraft-manifest-literals-'));
  try {
    mkdirSync(join(root, 'src/games'), { recursive: true });
    const file = join(root, 'src/games/manifest.ts');
    writeFileSync(file, String.raw`
      // gameCatalog = [{ title: 'This comment is not the catalog' }];
      throw new Error('Authored code must never execute');
      export const gameCatalog: readonly { id: string; title: string; entry: string; exportName: string }[] = [
        { id: 'first', title: 'Escape {Prototype} ]; \'quoted\' \\ path \u2605', entry: './first/index.ts', exportName: 'game' },
        /* braces { } and ]; inside comments do not delimit the array */
        { 'id': 'second', 'title': "Second \"World\"", entry: './second/index.ts', exportName: 'game' },
      ] as const satisfies readonly unknown[]
    `);
    assert.deepEqual(readGameCatalog(root).map(({ title }) => title), ["Escape {Prototype} ]; 'quoted' \\ path ★", 'Second "World"']);
  } finally { rmSync(root, { recursive: true }); }
});

test('manifest metadata rejects executable expressions and incomplete or ambiguous entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'lorecraft-manifest-invalid-'));
  try {
    mkdirSync(join(root, 'src/games'), { recursive: true });
    const file = join(root, 'src/games/manifest.ts');
    const entry = "{ id: 'first', title: 'First', entry: './first/index.ts', exportName: 'game' }";
    for (const expression of [
      `[${entry}, ...otherGames]`, `[${entry}, null]`, `[${entry}, ,]`, `[${entry}, ${entry}]`,
      `[${entry.replace("title: 'First'", "title: makeTitle()")}]`,
      `[${entry.replace("title: 'First'", "title: 'First', title: 'Override'")}]`,
      `[${entry.replace("title: 'First'", "...metadata")}]`,
      `[${entry.replace("title: 'First'", "['title']: 'First'")}]`,
      `[${entry.replace("title: 'First', ", '')}]`, `getCatalog()`,
    ]) {
      writeFileSync(file, `export const gameCatalog = ${expression};`);
      assert.throws(() => readGameCatalog(root), /catalog/i, expression);
    }
    writeFileSync(file, "export const gameCatalog = [{ title: 'unfinished");
    assert.throws(() => readGameCatalog(root), /syntax/);
  } finally { rmSync(root, { recursive: true }); }
});
