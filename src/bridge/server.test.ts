import assert from 'node:assert/strict';
import test from 'node:test';
import WebSocket from 'ws';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { RuntimeBridgeServer } from './server';

type Message = Record<string, unknown>;

async function startServer(timeout = 100): Promise<RuntimeBridgeServer> {
  const server = new RuntimeBridgeServer({ port: 0, token: 'test-token', requestTimeoutMs: timeout, shutdownTimeoutMs: 30, log: () => undefined });
  await server.ready;
  return server;
}

async function connect(server: RuntimeBridgeServer): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`, { headers: { Authorization: 'Bearer test-token' } });
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

test('rejects missing tokens and untrusted origins before accepting a connection', async () => {
  const server = await startServer();
  try {
    for (const options of [
      {},
      { headers: { Authorization: 'Bearer wrong-token' } },
      { origin: 'https://untrusted.example', headers: { Authorization: 'Bearer test-token' } },
      { origin: 'http://localhost:5173.untrusted.example', headers: { Authorization: 'Bearer test-token' } },
    ]) {
      const socket = new WebSocket(`ws://127.0.0.1:${server.port}`, options);
      await assert.rejects(once(socket, 'open'), /Unexpected server response: 40[13]/);
    }
    const trusted = new WebSocket(`ws://127.0.0.1:${server.port}`, {
      origin: 'http://localhost:5173', headers: { Authorization: 'Bearer test-token' },
    });
    await once(trusted, 'open');
    await closeSocket(trusted);
  } finally { await server.close(); }
});

test('runtime replacement immediately fails requests assigned to the old runtime', async () => {
  const server = await startServer(1_000);
  const runtime = await connect(server);
  const client = await connect(server);
  try {
    send(runtime, { kind: 'hello', role: 'runtime' });
    send(client, { kind: 'hello', role: 'client' });
    const forwarded = nextMessage(runtime);
    const response = nextMessage(client);
    send(client, { kind: 'request', requestId: 'replacement', operation: 'getGameState', args: {} });
    await forwarded;
    const replacement = await connect(server);
    send(replacement, { kind: 'hello', role: 'runtime' });
    assert.deepEqual((await response).error, { code: 'RUNTIME_DISCONNECTED', message: 'Browser game runtime was replaced.' });
    const nextRequest = nextMessage(replacement);
    send(client, { kind: 'request', requestId: 'new-runtime', operation: 'getGameState', args: {} });
    assert.equal((await nextRequest).requestId, 'new-runtime');
    await closeSocket(replacement);
  } finally { await server.close(); }
});

test('shutdown closes connected clients and terminates an unresponsive peer', { timeout: 2_000 }, async () => {
  const server = await startServer();
  const socket = await connect(server);
  const unfinishedHandshake = createConnection({ host: '127.0.0.1', port: server.port });
  unfinishedHandshake.on('error', (error: NodeJS.ErrnoException) => assert.equal(error.code, 'ECONNRESET'));
  await once(unfinishedHandshake, 'connect');
  unfinishedHandshake.write('GET / HTTP/1.1\r\nHost: localhost\r\n');
  // Stop reading to simulate a client that never answers the close frame.
  socket.pause();
  const closing = server.close();
  assert.equal(server.close(), closing);
  await closing;
  socket.terminate();
  unfinishedHandshake.destroy();
});

test('identified runtimes must become ready, and Node clients cannot send lifecycle controls', async () => {
  const server = await startServer(50);
  const runtime = await connect(server);
  const client = await connect(server);
  try {
    send(runtime, { kind: 'hello', role: 'runtime', identity: { sessionId: 'session', runtimeId: 'runtime', gameId: 'test' } });
    send(client, { kind: 'hello', role: 'client' });
    const notReady = nextMessage(client);
    send(client, { kind: 'request', requestId: 'early', operation: 'getGameState', args: {} });
    assert.equal(((await notReady).error as { code: string }).code, 'RUNTIME_NOT_READY');
    send(runtime, { kind: 'runtimeStatus', state: 'ready' });
    const forwarded = nextMessage(runtime);
    // This must not arrive at the runtime. The next message must be the state request.
    send(client, { kind: 'control', action: 'stop' });
    send(client, { kind: 'request', requestId: 'after-ready', operation: 'getGameState', args: {} });
    assert.equal((await forwarded).requestId, 'after-ready');
    assert.equal(server.runtimeStatus?.state, 'ready');
  } finally { await closeSocket(client); await closeSocket(runtime); await server.close(); }
});
