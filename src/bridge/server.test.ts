import assert from 'node:assert/strict';
import test from 'node:test';
import WebSocket from 'ws';
import { RuntimeBridgeServer } from './server';

type Message = Record<string, unknown>;

async function startServer(timeout = 100): Promise<RuntimeBridgeServer> {
  const server = new RuntimeBridgeServer({ port: 0, requestTimeoutMs: timeout, log: () => undefined });
  for (let attempts = 0; !server.port && attempts < 20; attempts++) await delay(5);
  if (!server.port) throw new Error('Bridge server did not start.');
  return server;
}

async function connect(server: RuntimeBridgeServer): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
}

function nextMessage(socket: WebSocket): Promise<Message> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData) => {
      cleanup();
      resolve(JSON.parse(data.toString()) as Message);
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const cleanup = () => {
      socket.off('message', onMessage);
      socket.off('error', onError);
    };
    socket.once('message', onMessage);
    socket.once('error', onError);
  });
}

function send(socket: WebSocket, message: Message): void {
  socket.send(JSON.stringify(message));
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve) => { socket.once('close', resolve); socket.close(); });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('routes a runtime response to the matching client request', async () => {
  const server = await startServer();
  const runtime = await connect(server);
  const client = await connect(server);
  try {
    send(runtime, { kind: 'hello', role: 'runtime' });
    send(client, { kind: 'hello', role: 'client' });
    const forwarded = nextMessage(runtime);
    send(client, { kind: 'request', requestId: 'move-1', operation: 'setEntityPosition', args: { id: 'player-1', position: { x: 2, y: 3 } } });
    assert.deepEqual(await forwarded, {
      kind: 'request', requestId: 'move-1', operation: 'setEntityPosition', args: { id: 'player-1', position: { x: 2, y: 3 } },
    });
    const response = nextMessage(client);
    send(runtime, { kind: 'response', requestId: 'move-1', ok: true, result: { id: 'player-1', position: { x: 2, y: 3 } } });
    assert.deepEqual(await response, {
      kind: 'response', requestId: 'move-1', ok: true, result: { id: 'player-1', position: { x: 2, y: 3 } },
    });
  } finally {
    await closeSocket(runtime);
    await closeSocket(client);
    await server.close();
  }
});

test('returns structured errors for invalid operations and request timeouts', async () => {
  const server = await startServer(30);
  const runtime = await connect(server);
  const client = await connect(server);
  try {
    send(runtime, { kind: 'hello', role: 'runtime' });
    send(client, { kind: 'hello', role: 'client' });
    const invalidResponse = nextMessage(client);
    send(client, { kind: 'request', requestId: 'invalid-1', operation: 'notSupported', args: {} });
    assert.deepEqual(await invalidResponse, {
      kind: 'response', requestId: 'invalid-1', ok: false,
      error: { code: 'UNSUPPORTED_OPERATION', message: 'Unsupported operation "notSupported".' },
    });

    const timeoutResponse = nextMessage(client);
    send(client, { kind: 'request', requestId: 'slow-1', operation: 'getGameState', args: {} });
    const timedOut = await timeoutResponse;
    assert.equal(timedOut.requestId, 'slow-1');
    assert.deepEqual(timedOut.error, { code: 'REQUEST_TIMEOUT', message: 'Request "slow-1" timed out after 30ms.' });
  } finally {
    await closeSocket(runtime);
    await closeSocket(client);
    await server.close();
  }
});

test('fails pending client requests when the browser runtime disconnects', async () => {
  const server = await startServer();
  const runtime = await connect(server);
  const client = await connect(server);
  try {
    send(runtime, { kind: 'hello', role: 'runtime' });
    send(client, { kind: 'hello', role: 'client' });
    const response = nextMessage(client);
    send(client, { kind: 'request', requestId: 'disconnect-1', operation: 'getGameState', args: {} });
    await nextMessage(runtime);
    await closeSocket(runtime);
    const disconnected = await response;
    assert.deepEqual(disconnected.error, { code: 'RUNTIME_DISCONNECTED', message: 'Browser game runtime disconnected.' });
  } finally {
    await closeSocket(client);
    await server.close();
  }
});
