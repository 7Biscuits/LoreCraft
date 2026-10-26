import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSync } from 'vite';
import type { ESTree } from 'vite';

type CatalogEntry = { id: string; title: string; entry: string; exportName: string };
const metadataFields = ['id', 'title', 'entry', 'exportName'] as const;

function unwrap(expression: ESTree.Expression | null | undefined): ESTree.Expression | null | undefined {
  while (expression?.type === 'TSAsExpression' || expression?.type === 'TSSatisfiesExpression' || expression?.type === 'TSNonNullExpression') expression = expression.expression;
  return expression;
}

/** Read literal metadata without executing authored modules in Node. */
export function readGameCatalog(root: string): CatalogEntry[] {
  const file = join(root, 'src/games/manifest.ts');
  const parsed = parseSync(file, readFileSync(file, 'utf8'));
  if (parsed.errors.length) throw new Error('Game manifest contains invalid TypeScript syntax.');
  const declarations = parsed.program.body.flatMap((statement) => {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    return declaration?.type === 'VariableDeclaration' ? declaration.declarations : [];
  }).filter((declaration) => declaration.id.type === 'Identifier' && declaration.id.name === 'gameCatalog');
  const catalog = declarations.length === 1 ? unwrap(declarations[0]!.init) : undefined;
  if (catalog?.type !== 'ArrayExpression') throw new Error('Game manifest must contain a literal gameCatalog array.');
  const invalidMetadata = () => new Error('Invalid game catalog metadata. Use literal id, title, entry, and exportName fields.');
  const result = catalog.elements.map((element) => {
    if (element?.type !== 'ObjectExpression') throw invalidMetadata();
    const fields: Record<string, string> = Object.create(null);
    for (const property of element.properties) {
      if (property.type !== 'Property' || property.computed || property.method || property.shorthand || property.kind !== 'init') throw invalidMetadata();
      const key = property.key.type === 'Identifier' ? property.key.name : property.key.type === 'Literal' ? property.key.value : undefined;
      if (!metadataFields.some((field) => field === key)) continue;
      const value = unwrap(property.value as ESTree.Expression);
      if (typeof key !== 'string' || Object.hasOwn(fields, key) || value?.type !== 'Literal' || typeof value.value !== 'string') throw invalidMetadata();
      fields[key] = value.value;
    }
    if (!/^[a-z0-9-]+$/.test(fields.id ?? '') || typeof fields.title !== 'string' || fields.entry !== `./${fields.id}/index.ts` || !/^[A-Za-z_$][\w$]*$/.test(fields.exportName ?? '')) throw invalidMetadata();
    return fields as CatalogEntry;
  });
  if (!result.length || new Set(result.map((game) => game.id)).size !== result.length) throw new Error('Game catalog is empty or has duplicate IDs.');
  return result;
}
