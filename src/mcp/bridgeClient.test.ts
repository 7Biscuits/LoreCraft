import assert from 'node:assert/strict';
import test from 'node:test';
import WebSocket from 'ws';
import { RuntimeBridgeServer } from '../bridge/server';
import { GameBridgeClient } from './bridgeClient';

async function startServer(timeout = 100): Promise<RuntimeBridgeServer> {
  const server = new RuntimeBridgeServer({ port: 0, requestTimeoutMs: timeout, log: () => undefined });
  for (let attempts = 0; !server.port && attempts < 20; attempts++) await delay(5);
  if (!server.port) throw new Error('Bridge server did not start.');
  return server;
}

async function connectRuntime(server: RuntimeBridgeServer): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('forwards MCP bridge requests and preserves game responses', async () => {
  const server = await startServer();
  const runtime = await connectRuntime(server);
  const client = new GameBridgeClient({ url: `ws://127.0.0.1:${server.port}` });
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
  const unavailableClient = new GameBridgeClient({ url: `ws://127.0.0.1:${unavailableServer.port}` });
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
  const timeoutClient = new GameBridgeClient({ url: `ws://127.0.0.1:${timeoutServer.port}`, requestTimeoutMs: 100 });
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
