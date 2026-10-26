import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { pathToFileURL } from 'node:url';
import * as z from 'zod/v4';
import { GameBridgeClient } from './bridgeClient';
import type { GameBridgeResult } from './bridgeClient';
import { RuntimeLifecycleManager } from '../lifecycle/manager';
import type { LifecycleResult } from '../lifecycle/manager';

const finiteNumber = z.number().finite();
const position2D = z.object({ x: finiteNumber, y: finiteNumber }).strict();
const position3D = z.object({ x: finiteNumber, y: finiteNumber, z: finiteNumber }).strict();
const position = z.union([position2D, position3D]);
const size = z.union([z.object({ x: finiteNumber.positive(), y: finiteNumber.positive() }).strict(), z.object({ x: finiteNumber.positive(), y: finiteNumber.positive(), z: finiteNumber.positive() }).strict()]);
const entityType = z.enum(['player', 'coin', 'enemy', 'obstacle']);
const entityDimension = z.enum(['2d', '3d']);
const properties = z.object({
  size: size.optional(),
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
      size: size.optional(),
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
  listGames: z.object({}).strict(),
  selectGame: z.object({ gameId: z.string().regex(/^[a-z0-9-]+$/).max(128) }).strict(),
  launchGame: z.object({ gameId: z.string().regex(/^[a-z0-9-]+$/).max(128).optional(), openBrowser: z.boolean().default(true) }).strict(),
  getRuntimeStatus: z.object({}).strict(),
  reloadGame: z.object({}).strict(),
  stopGame: z.object({}).strict(),
  beginCreation: z.object({ gameId: z.string().regex(/^[a-z0-9-]+$/).max(128), title: z.string().min(1).max(120), prompt: z.string().max(4000).default(''), openBrowser: z.boolean().default(true) }).strict(),
  updateCreation: z.object({ gameId: z.string().regex(/^[a-z0-9-]+$/).max(128), stage: z.enum(['planning', 'authoring', 'testing', 'error']), message: z.string().min(1).max(4000) }).strict(),
  stepGame: z.object({ frames: z.number().int().min(1).max(600) }).strict(),
  simulateInput: z.object({ x: finiteNumber.min(-1).max(1), y: finiteNumber.min(-1).max(1), frames: z.number().int().min(1).max(600) }).strict(),
};

export function createMcpServer(bridge = new GameBridgeClient(), lifecycle = new RuntimeLifecycleManager()): McpServer {
  const server = new McpServer(
    { name: 'lorecraft-game', version: '0.1.0' },
    { instructions: 'Before writing a game, call begin_game_creation with its gameId, title, and user prompt. This opens the LoreCraft studio and displays live progress while you author source. Call update_game_creation at meaningful planning/authoring/testing milestones and on errors. Author source in src/games and register it in the literal manifest; list_games reads fresh metadata without an MCP restart. Then call launch_game with the same gameId to validate/build and verify the game in the background and add it to the studio game library. The user can keep playing another game; do not replace their selected preview or open a blank game tab. reload_game validates edits. Runtime tools control the embedded game. Stop owned servers when requested or when ending the MCP session.' },
  );
  server.server.onclose = () => { void Promise.all([bridge.close(), lifecycle.stopGame()]); };
  server.registerTool('begin_game_creation', { description: 'Call FIRST before editing game source. Open the LoreCraft website and display agent creation progress. The game ID can be new and need not be registered yet. Does not generate code itself.', inputSchema: toolSchemas.beginCreation },
    async ({ gameId, title, prompt, openBrowser }) => toToolResult(await lifecycle.beginCreation(gameId, title, prompt, openBrowser)));
  server.registerTool('update_game_creation', { description: 'Publish a real authoring/testing milestone or error in the LoreCraft website. Call while creating the game; launch_game performs the actual build and preview loading.', inputSchema: toolSchemas.updateCreation },
    ({ gameId, stage, message }) => toToolResult(lifecycle.updateCreation(gameId, stage, message)));

  server.registerTool('list_games', {
    description: 'List registered source-authored games available to launch.', inputSchema: toolSchemas.listGames,
  }, () => toToolResult({ ok: true, result: { games: lifecycle.listGames() } }));
  server.registerTool('select_game', {
    description: 'Select a registered game for the next launch. Stop a different running game first.', inputSchema: toolSchemas.selectGame,
  }, ({ gameId }) => toToolResult(lifecycle.selectGame(gameId)));
  server.registerTool('launch_game', {
    description: 'Validate source, start owned loopback bridge and Vite servers, open a browser, and wait for readiness. Existing manual servers must be stopped first. With openBrowser=false, open the URL from get_runtime_status in another client while this call waits.',
    inputSchema: toolSchemas.launchGame,
  }, async ({ gameId, openBrowser }) => toToolResult(await lifecycle.launchGame(gameId, openBrowser)));
  server.registerTool('get_runtime_status', {
    description: 'Inspect managed game selection, URL, session identity, readiness, diagnostics, and server ownership.', inputSchema: toolSchemas.getRuntimeStatus,
  }, () => toToolResult({ ok: true, result: lifecycle.getStatus() }));
  server.registerTool('reload_game', {
    description: 'Validate edited source and reload the managed browser document. Wait for the new session to initialize. Gameplay state resets.', inputSchema: toolSchemas.reloadGame,
  }, async () => toToolResult(await lifecycle.reloadGame()));
  server.registerTool('stop_game', {
    description: 'Cancel a pending launch, stop the managed document, and close owned bridge/Vite servers. Leaves manually started servers alone.', inputSchema: toolSchemas.stopGame,
  }, async () => toToolResult(await lifecycle.stopGame()));

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
  for (const [name, operation, description] of [
    ['pause_game', 'pauseGame', 'Pause the active runtime without destroying it.'],
    ['resume_game', 'resumeGame', 'Resume the active runtime.'],
    ['get_runtime_logs', 'getRuntimeLogs', 'Read the bounded runtime diagnostic log.'],
    ['run_gameplay_test', 'runGameplayTest', 'Run deterministic generated-game scenarios and return individual assertions.'],
  ] as const) server.registerTool(name, { description, inputSchema: z.object({}).strict() }, () => callGame(bridge, operation, {}));
  server.registerTool('step_game', { description: 'Pause and advance exactly 1–600 engine frames.', inputSchema: toolSchemas.stepGame }, (args) => callGame(bridge, 'stepGame', args));
  server.registerTool('simulate_input', { description: 'Pause and apply a movement vector for 1–600 frames. Return the resulting state.', inputSchema: toolSchemas.simulateInput }, (args) => callGame(bridge, 'simulateInput', args));
  server.registerTool('capture_screenshot', { description: 'Capture the current game canvas as a PNG.', inputSchema: z.object({}).strict() }, async () => {
    const result = await bridge.request('captureScreenshot', {});
    if (result.ok && result.result && typeof result.result === 'object' && 'dataUrl' in result.result && typeof result.result.dataUrl === 'string' && result.result.dataUrl.startsWith('data:image/png;base64,')) {
      return { content: [{ type: 'image' as const, mimeType: 'image/png', data: result.result.dataUrl.slice('data:image/png;base64,'.length) }], isError: false };
    }
    return toToolResult(result);
  });
  return server;
}

async function callGame(bridge: GameBridgeClient, operation: Parameters<GameBridgeClient['request']>[0], args: Record<string, unknown>) {
  const result = await bridge.request(operation, args);
  return toToolResult(result);
}

function toToolResult(result: GameBridgeResult | LifecycleResult) {
  const payload = result;
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
