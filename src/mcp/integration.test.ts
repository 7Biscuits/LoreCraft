import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { setHeadlessMode, setEngineManualStep } from 'littlejsengine';
import { loadOrCreateBridgeToken } from '../bridge/access';
import { BrowserRuntimeBridge } from '../bridge/browserBridge';
import { RuntimeBridgeServer } from '../bridge/server';
import { AuthoredGameHost } from '../games/host';
import { MazeEscapeGame } from '../games/maze-escape';
import type { GameStateSnapshot } from '../runtime';

interface RpcResponse {
  id: number;
  error?: unknown;
  result?: {
    tools?: { name: string }[];
    structuredContent?: { ok: boolean; result?: GameStateSnapshot };
    isError?: boolean;
  };
}

test('MCP stdio controls the authenticated live game and reports objectives and reset', { timeout: 10_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lorecraft-mcp-'));
  const tokenFile = join(directory, 'token');
  const token = loadOrCreateBridgeToken(tokenFile);
  const server = new RuntimeBridgeServer({ port: 0, token, log: () => {} });
  await server.ready;
  setHeadlessMode(true);
  setEngineManualStep(true);
  const game = new MazeEscapeGame();
  const host = new AuthoredGameHost(game);
  const runtime = await host.start();
  class AuthenticatedSocket extends WebSocket {
    constructor(url: string) { super(url, { headers: { Authorization: `Bearer ${token}` } }); }
  }
  const browser = new BrowserRuntimeBridge(runtime, {
    url: `ws://127.0.0.1:${server.port}`, WebSocketConstructor: AuthenticatedSocket as unknown as typeof globalThis.WebSocket,
  });
  browser.connect();
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/mcp/server.ts'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, MCP_BRIDGE_URL: `ws://127.0.0.1:${server.port}`, LORECRAFT_BRIDGE_TOKEN_FILE: tokenFile },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const waiters = new Map<number, { resolve: (message: RpcResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const invalidLines: string[] = [];
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let message: RpcResponse;
    try { message = JSON.parse(line) as RpcResponse; }
    catch { invalidLines.push(line); return; }
    const waiter = waiters.get(message.id);
    if (!waiter) return;
    clearTimeout(waiter.timer); waiters.delete(message.id); waiter.resolve(message);
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      for (const waiter of waiters.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(stderr)); }
      waiters.clear(); resolve(code);
    });
  });
  let id = 0;
  const rpc = (method: string, params: unknown) => new Promise<RpcResponse>((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { waiters.delete(requestId); reject(new Error(`MCP timeout: ${method}\n${stderr}`)); }, 3_000);
    waiters.set(requestId, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
  });
  const call = async (name: string, args = {}) => {
    const response = await rpc('tools/call', { name, arguments: args });
    assert.equal(response.error, undefined);
    assert.equal(response.result?.isError, false);
    return response.result?.structuredContent;
  };
  try {
    assert.equal((await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'regression', version: '1' } })).error, undefined);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    assert.equal((await rpc('tools/list', {})).result?.tools?.length, 23);
    assert.equal((await rpc('tools/call', { name: 'list_games', arguments: {} })).result?.isError, false);
    assert.equal((await rpc('tools/call', { name: 'get_runtime_status', arguments: {} })).result?.isError, false);
    assert.equal((await rpc('tools/call', { name: 'select_game', arguments: { gameId: 'does-not-exist' } })).result?.isError, true);
    await call('set_entity_properties', { id: 'enemy-1', properties: { speed: 0 } });
    const inspected = await call('get_game_state');
    assert.equal(inspected?.result?.entities.find((entity) => entity.id === 'enemy-1')?.properties.speed, 0);
    await call('delete_entity', { id: 'enemy-1' });
    await call('set_entity_position', { id: 'player-1', position: { x: -5.5, y: 5.5 } });
    const frame = { deltaSeconds: 1 / 60, movement: { x: 0, y: 0 }, restart: false };
    game.update(frame);
    await call('set_entity_position', { id: 'player-1', position: { x: 6.5, y: 6.5 } });
    game.update(frame);
    assert.deepEqual((await call('get_game_state'))?.result?.state, { hasKey: true, outcome: 'won' });
    const reset = await call('reset_game');
    assert.deepEqual(reset?.result?.state, { hasKey: false, outcome: 'playing' });
    assert.equal(reset?.result?.entities.length, 7);
    child.stdin.end();
    let exitDeadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        exitDeadline = setTimeout(() => reject(new Error('MCP did not release its bridge connection on EOF.')), 2_000);
      });
      assert.equal(await Promise.race([exited, timeout]), 0);
    } finally { clearTimeout(exitDeadline); }
    assert.deepEqual(invalidLines, []);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    for (const waiter of waiters.values()) clearTimeout(waiter.timer);
    lines.close(); browser.disconnect(); host.destroy();
    await server.close(); rmSync(directory, { recursive: true });
  }
});
