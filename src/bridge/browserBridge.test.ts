import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { BrowserRuntimeBridge } from './browserBridge';
import { RuntimeBridgeServer } from './server';
import { GameBridgeClient } from '../mcp/bridgeClient';
import { EntityRegistry, GameRuntime } from '../runtime';

class AuthenticatedSocket extends WebSocket {
  constructor(url: string) { super(url, { headers: { Authorization: 'Bearer test-token' } }); }
}
const socketConstructor = AuthenticatedSocket as unknown as typeof globalThis.WebSocket;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function runtime() {
  return new GameRuntime(new EntityRegistry(), {
    createEntity: () => ({ ok: false, error: { code: 'OPERATION_FAILED', message: 'Not used.' } }),
    getGameState: () => ({ mode: 'test', score: 0 }), resetGame: () => {},
  });
}

test('two browser runtimes settle on the newest tab without a reconnect storm', { timeout: 2_000 }, async () => {
  const server = new RuntimeBridgeServer({ port: 0, token: 'test-token', log: () => {} });
  await server.ready;
  const url = `ws://127.0.0.1:${server.port}`;
  const statuses: string[] = [];
  let resolveReplaced!: () => void;
  const replaced = new Promise<void>((resolve) => { resolveReplaced = resolve; });
  const browserA = new BrowserRuntimeBridge(runtime(), {
    url, WebSocketConstructor: socketConstructor, reconnectDelayMs: 5,
    onStatus: (status) => {
      statuses.push(status);
      if (status.includes('replaced by')) resolveReplaced();
    },
  });
  const browserB = new BrowserRuntimeBridge(runtime(), { url, WebSocketConstructor: socketConstructor, reconnectDelayMs: 5 });
  const client = new GameBridgeClient({ url, token: 'test-token' });
  try {
    browserA.connect();
    // A successful request proves the first runtime has registered its role.
    for (let i = 0; i < 50; i++) {
      const state = await client.request('getGameState', {});
      if (state.ok) break;
      await delay(5);
    }
    browserB.connect();
    await replaced;
    await delay(40);
    assert.equal(statuses.filter((status) => status === 'Runtime bridge connected.').length, 1);
    assert.equal((await client.request('getGameState', {})).ok, true);
    browserA.connect(); // Explicit user reconnection can reclaim the runtime.
    await delay(30);
    assert.equal(statuses.filter((status) => status === 'Runtime bridge connected.').length, 2);
  } finally {
    browserA.disconnect(); browserB.disconnect();
    await client.close(); await server.close();
  }
});

test('runtime exceptions become structured errors instead of unanswered requests', { timeout: 2_000 }, async () => {
  const server = new RuntimeBridgeServer({ port: 0, token: 'test-token', log: () => {} });
  await server.ready;
  const url = `ws://127.0.0.1:${server.port}`;
  const game = runtime();
  let fail = false;
  const normalState = game.getGameState.bind(game);
  game.getGameState = () => { if (fail) throw new Error('Game inspection failed.'); return normalState(); };
  const browser = new BrowserRuntimeBridge(game, { url, WebSocketConstructor: socketConstructor });
  const client = new GameBridgeClient({ url, token: 'test-token' });
  try {
    browser.connect();
    for (let i = 0; i < 50; i++) {
      if ((await client.request('getGameState', {})).ok) break;
      await delay(5);
    }
    fail = true;
    assert.deepEqual(await client.request('getGameState', {}), {
      ok: false, error: { code: 'OPERATION_FAILED', message: 'Game inspection failed.' },
    });
  } finally { browser.disconnect(); await client.close(); await server.close(); }
});

test('unexpected disconnection reconnects when the bridge restarts', { timeout: 2_000 }, async () => {
  const options = { port: 0, token: 'test-token', log: () => {} };
  let server = new RuntimeBridgeServer(options);
  await server.ready;
  const port = server.port;
  let connections = 0;
  let firstConnected!: () => void;
  let reconnected!: () => void;
  const first = new Promise<void>((resolve) => { firstConnected = resolve; });
  const second = new Promise<void>((resolve) => { reconnected = resolve; });
  const browser = new BrowserRuntimeBridge(runtime(), {
    url: `ws://127.0.0.1:${port}`, WebSocketConstructor: socketConstructor, reconnectDelayMs: 5,
    onStatus: (status) => {
      if (status !== 'Runtime bridge connected.') return;
      if (++connections === 1) firstConnected();
      else reconnected();
    },
  });
  const client = new GameBridgeClient({ url: `ws://127.0.0.1:${port}`, token: 'test-token' });
  try {
    browser.connect(); await first;
    await server.close();
    server = new RuntimeBridgeServer({ ...options, port });
    await server.ready; await second;
    assert.equal((await client.request('getGameState', {})).ok, true);
  } finally { browser.disconnect(); await client.close(); await server.close(); }
});

test('optional relay waits without opening sockets and connects when it becomes available', { timeout: 3000 }, async () => {
  let available = false, attempts = 0, checks = 0;
  const statuses: string[] = [];
  const server = new RuntimeBridgeServer({ port: 0, token: 'test-token', log: () => {} });
  await server.ready;
  class CountingSocket extends AuthenticatedSocket {
    constructor(url: string) { attempts++; super(url); }
  }
  let connected!: () => void;
  const connection = new Promise<void>((resolve) => { connected = resolve; });
  const browser = new BrowserRuntimeBridge(runtime(), {
    url: `ws://127.0.0.1:${server.port}`, reconnectDelayMs: 5,
    WebSocketConstructor: CountingSocket as unknown as typeof globalThis.WebSocket,
    checkAvailability: async () => { checks++; return available; },
    onStatus: (status) => { statuses.push(status); if (status === 'Runtime bridge connected.') connected(); },
  });
  try {
    browser.connect();
    while (checks < 3) await delay(5);
    assert.equal(attempts, 0, 'An offline relay must not trigger WebSocket proxy attempts.');
    assert.deepEqual(statuses, ['MCP relay offline; gameplay remains available.']);
    available = true;
    await connection;
    assert.equal(attempts, 1);
    available = false;
    await server.close();
    await delay(30);
    assert.equal(attempts, 1, 'A stopped relay must return to availability checks.');
  } finally { browser.disconnect(); await server.close(); }
});

test('disconnect cancels a pending relay availability check', async () => {
  let finish!: (available: boolean) => void;
  let attempts = 0;
  class UnexpectedSocket { static OPEN = 1; static CONNECTING = 0; constructor() { attempts++; } }
  const browser = new BrowserRuntimeBridge(runtime(), {
    url: 'ws://127.0.0.1:8787/runtime-bridge',
    WebSocketConstructor: UnexpectedSocket as unknown as typeof globalThis.WebSocket,
    checkAvailability: () => new Promise((resolve) => { finish = resolve; }),
  });
  browser.connect(); browser.disconnect(); finish(true);
  await delay(10);
  assert.equal(attempts, 0);
});
