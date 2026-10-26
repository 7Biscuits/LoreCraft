import assert from 'node:assert/strict';
import test from 'node:test';
import { toolSchemas } from './server';

test('MCP tool schemas accept valid game arguments and reject invalid dimensions', () => {
  const valid = toolSchemas.createEntity.safeParse({
    id: 'coin-mcp-1', type: 'coin', dimension: '2d', position: { x: 3, y: 2 },
  });
  assert.equal(valid.success, true);

  const invalid = toolSchemas.createEntity.safeParse({
    id: 'cube-mcp-1', type: 'obstacle', dimension: '3d', position: { x: 3, y: 2 },
  });
  assert.equal(invalid.success, false);

  assert.equal(toolSchemas.setEntityProperties.safeParse({ id: 'player-1', properties: {} }).success, false);
  assert.equal(toolSchemas.setEntityPosition.safeParse({ id: 'player-1', position: { x: Number.NaN, y: 1 } }).success, false);
});

test('lifecycle inputs accept registered-style game IDs and reject arbitrary command arguments', () => {
  assert.equal(toolSchemas.launchGame.safeParse({ gameId: 'maze-escape', openBrowser: false }).success, true);
  assert.equal(toolSchemas.launchGame.safeParse({ gameId: '../outside' }).success, false);
  assert.equal(toolSchemas.launchGame.safeParse({ command: 'sh' }).success, false);
  assert.equal(toolSchemas.selectGame.safeParse({ gameId: '' }).success, false);
  assert.equal(toolSchemas.reloadGame.safeParse({ url: 'https://example.com' }).success, false);
});
