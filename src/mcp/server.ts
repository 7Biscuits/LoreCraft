import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { pathToFileURL } from 'node:url';
import * as z from 'zod/v4';
import { GameBridgeClient } from './bridgeClient';
import type { GameBridgeResult } from './bridgeClient';

const finiteNumber = z.number().finite();
const position2D = z.object({ x: finiteNumber, y: finiteNumber }).strict();
const position3D = z.object({ x: finiteNumber, y: finiteNumber, z: finiteNumber }).strict();
const position = z.union([position2D, position3D]);
const entityType = z.enum(['player', 'coin', 'enemy', 'obstacle']);
const entityDimension = z.enum(['2d', '3d']);
const properties = z.object({
  size: position.optional(),
  speed: finiteNumber.nonnegative().optional(),
  rotation: finiteNumber.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one property to update.');

export const toolSchemas = {
  createEntity: z.object({
    id: z.string().trim().min(1).max(128),
    type: entityType,
    dimension: entityDimension,
    position,
    properties: z.object({
      size: position.optional(),
      speed: finiteNumber.nonnegative().optional(),
      rotation: finiteNumber.optional(),
    }).strict().optional(),
  }).superRefine((value, context) => {
    const expectedZ = value.dimension === '3d';
    if (('z' in value.position) !== expectedZ) {
      context.addIssue({ code: 'custom', message: `A ${value.dimension} entity needs a ${value.dimension} position.`, path: ['position'] });
    }
    if (value.properties?.size && ('z' in value.properties.size) !== expectedZ) {
      context.addIssue({ code: 'custom', message: `A ${value.dimension} entity needs a ${value.dimension} size.`, path: ['properties', 'size'] });
    }
  }),
  getEntity: z.object({ id: z.string().trim().min(1).max(128) }),
  listEntities: z.object({}),
  setEntityPosition: z.object({ id: z.string().trim().min(1).max(128), position }),
  setEntityProperties: z.object({ id: z.string().trim().min(1).max(128), properties }),
  deleteEntity: z.object({ id: z.string().trim().min(1).max(128) }),
  getGameState: z.object({}),
  resetGame: z.object({}),
};

export function createMcpServer(bridge = new GameBridgeClient()): McpServer {
  const server = new McpServer(
    { name: 'lorecraft-game', version: '0.1.0' },
    { instructions: 'These tools control only the currently running Lorecraft game through its local runtime bridge.' },
  );
  server.server.onclose = () => { void bridge.close(); };

  server.registerTool('create_entity', {
    description: 'Create a player, coin, enemy, or obstacle in the running game.',
    inputSchema: toolSchemas.createEntity,
  }, (args) => callGame(bridge, 'createEntity', args));
  server.registerTool('get_entity', {
    description: 'Get the current state of one entity by stable ID.',
    inputSchema: toolSchemas.getEntity,
  }, (args) => callGame(bridge, 'getEntity', args));
  server.registerTool('list_entities', {
    description: 'List every active entity registered in the running game.',
    inputSchema: toolSchemas.listEntities,
  }, (args) => callGame(bridge, 'listEntities', args));
  server.registerTool('set_entity_position', {
    description: 'Set an active entity position in 2D or 3D game space.',
    inputSchema: toolSchemas.setEntityPosition,
  }, (args) => callGame(bridge, 'setEntityPosition', args));
  server.registerTool('set_entity_properties', {
    description: 'Update an entity size, speed, and/or rotation.',
    inputSchema: toolSchemas.setEntityProperties,
  }, (args) => callGame(bridge, 'setEntityProperties', args));
  server.registerTool('delete_entity', {
    description: 'Delete an entity from the running game and registry.',
    inputSchema: toolSchemas.deleteEntity,
  }, (args) => callGame(bridge, 'deleteEntity', args));
  server.registerTool('get_game_state', {
    description: 'Get the active game mode, score, entities, and game-specific state such as objectives and win/loss outcome.',
    inputSchema: toolSchemas.getGameState,
  }, (args) => callGame(bridge, 'getGameState', args));
  server.registerTool('reset_game', {
    description: 'Reset the active game using its existing reset lifecycle.',
    inputSchema: toolSchemas.resetGame,
  }, (args) => callGame(bridge, 'resetGame', args));
  return server;
}

async function callGame(bridge: GameBridgeClient, operation: Parameters<GameBridgeClient['request']>[0], args: Record<string, unknown>) {
  const result = await bridge.request(operation, args);
  return toToolResult(result);
}

function toToolResult(result: GameBridgeResult) {
  const payload = result.ok ? { ok: true, result: result.result } : { ok: false, error: result.error };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: !result.ok,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const handle = serveStdio(() => createMcpServer(), {
    onerror: (error) => console.error('[lorecraft-mcp]', error.message),
  });
  const shutdown = () => { void handle.close(); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.error('Lorecraft MCP server running on stdio.');
}
