import assert from 'node:assert/strict';
import test from 'node:test';
import WebSocket from 'ws';
import { once } from 'node:events';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { RuntimeBridgeServer } from '../bridge/server';
import { GameBridgeClient } from './bridgeClient';

async function startServer(timeout = 100): Promise<RuntimeBridgeServer> {
  const server = new RuntimeBridgeServer({ port: 0, token: 'test-token', requestTimeoutMs: timeout, log: () => undefined });
  await server.ready;
  return server;
}

async function connectRuntime(server: RuntimeBridgeServer): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`, { headers: { Authorization: 'Bearer test-token' } });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  socket.send(JSON.stringify({ kind: 'hello', role: 'runtime' }));
  return socket;
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data) => resolve(JSON.parse(data.toString()) as Record<string, unknown>));
    socket.once('error', reject);
  });
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve) => { socket.once('close', resolve); socket.close(); });
}

test('forwards MCP bridge requests and preserves game responses', async () => {
  const server = await startServer();
  const runtime = await connectRuntime(server);
  const client = new GameBridgeClient({ url: `ws://127.0.0.1:${server.port}`, token: 'test-token' });
  try {
    const requested = nextMessage(runtime);
    const response = client.request('getGameState', {});
    const forwarded = await requested;
    assert.equal(forwarded.operation, 'getGameState');
    runtime.send(JSON.stringify({ kind: 'response', requestId: forwarded.requestId, ok: true, result: { mode: '2D', score: 0, entities: [] } }));
    assert.deepEqual(await response, { ok: true, result: { mode: '2D', score: 0, entities: [] } });
  } finally {
    await client.close();
    await closeSocket(runtime);
    await server.close();
  }
});

test('reports an unavailable runtime and a bridge timeout', async () => {
  const unavailableServer = await startServer();
  const unavailableClient = new GameBridgeClient({ url: `ws://127.0.0.1:${unavailableServer.port}`, token: 'test-token' });
  try {
    const unavailable = await unavailableClient.request('getGameState', {});
    assert.equal(unavailable.ok, false);
    if (!unavailable.ok) assert.equal(unavailable.error.code, 'RUNTIME_UNAVAILABLE');
  } finally {
    await unavailableClient.close();
    await unavailableServer.close();
  }

  const timeoutServer = await startServer(20);
  const runtime = await connectRuntime(timeoutServer);
  const timeoutClient = new GameBridgeClient({ url: `ws://127.0.0.1:${timeoutServer.port}`, token: 'test-token', requestTimeoutMs: 100 });
  try {
    const timeout = await timeoutClient.request('getGameState', {});
    assert.equal(timeout.ok, false);
    if (!timeout.ok) assert.equal(timeout.error.code, 'REQUEST_TIMEOUT');
  } finally {
    await timeoutClient.close();
    await closeSocket(runtime);
    await timeoutServer.close();
  }
});

test('concurrent requests time out while a TCP peer stalls the WebSocket handshake', { timeout: 2_000 }, async () => {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const client = new GameBridgeClient({ url: `ws://127.0.0.1:${address.port}`, token: 'test-token', requestTimeoutMs: 40 });
  try {
    const results = await Promise.all([client.request('getGameState', {}), client.request('listEntities', {})]);
    for (const result of results) {
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, 'REQUEST_TIMEOUT');
    }
  } finally {
    await client.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('closing during a handshake settles pending calls and forbids new requests', { timeout: 2_000 }, async () => {
  const server = createServer((socket) => socket.on('data', () => {}));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const client = new GameBridgeClient({ url: `ws://127.0.0.1:${address.port}`, token: 'test-token' });
  const connected = once(server, 'connection');
  const request = client.request('getGameState', {});
  const [socket] = await connected;
  await client.close();
  assert.equal((await request).ok, false);
  assert.equal((await client.request('listEntities', {})).ok, false);
  socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
