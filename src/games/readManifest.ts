import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Read literal metadata without executing authored modules in Node. */
export function readGameCatalog(root: string): { id: string; title: string; entry: string; exportName: string }[] {
  const source = readFileSync(join(root, 'src/games/manifest.ts'), 'utf8');
  const catalog = source.match(/gameCatalog[^=]*=\s*\[([\s\S]*?)\];/)?.[1];
  if (!catalog) throw new Error('Game manifest must contain a literal gameCatalog array.');
  const string = `(?:"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`;
  const field = new RegExp(`(id|title|entry|exportName)\\s*:\\s*(${string})`, 'g');
  const result = [...catalog.matchAll(/\{([^{}]*)\}/g)].map((match) => {
    const fields = Object.fromEntries([...match[1]!.matchAll(field)].map((m) => {
      const raw = m[2]!;
      const value = raw.startsWith('"') ? JSON.parse(raw) : JSON.parse(`"${raw.slice(1, -1).replace(/\\'/g, "'").replace(/(?<!\\)"/g, '\\"')}"`);
      return [m[1], value];
    }));
    if (!/^[a-z0-9-]+$/.test(fields.id ?? '') || typeof fields.title !== 'string' || fields.entry !== `./${fields.id}/index.ts` || !/^[A-Za-z_$][\w$]*$/.test(fields.exportName ?? '')) throw new Error('Invalid game catalog metadata. Use literal id, title, entry, and exportName fields.');
    return fields as { id: string; title: string; entry: string; exportName: string };
  });
  if (!result.length || new Set(result.map((g) => g.id)).size !== result.length) throw new Error('Game catalog is empty or has duplicate IDs.');
  return result;
}
