import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createServer, createLogger } from 'vite';
import { WebSocket } from 'ws';
import { RuntimeBridgeServer } from './server';
import { runtimeProxy } from './viteProxy';

test('Vite quietly rejects old-tab upgrades while the relay is offline and proxies when it returns', { timeout: 10000 }, async () => {
  const token = 'proxy-offline-test-token';
  let bridge = new RuntimeBridgeServer({ port: 0, token, log: () => {} });
  await bridge.ready;
  const port = bridge.port;
  await bridge.close();
  const errors: string[] = [];
  const logger = createLogger('silent');
  logger.error = (message) => { errors.push(message); };
  const vite = await createServer({
    configFile: false, customLogger: logger,
    server: { host: '127.0.0.1', port: 0, watch: null, proxy: { '/runtime-bridge': runtimeProxy(port, token) } },
  });
  let socket: WebSocket | undefined;
  try {
    await vite.listen();
    const address = vite.httpServer!.address(); assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    const url = `ws://127.0.0.1:${address.port}/runtime-bridge`;
    const offline = async () => {
      // No browser preflight: reproduce the exact request made by an older tab.
      const oldTab = new WebSocket(url, { origin });
      await assert.rejects(once(oldTab, 'open'), /Unexpected server response: 404/);
      assert.deepEqual(errors, [], 'Offline upgrades must not emit Vite ws proxy errors.');
    };
    await offline(); await offline();
    assert.equal((await fetch(origin)).status, 200, 'The dev website stays available.');
    bridge = new RuntimeBridgeServer({ port, token, allowedOrigins: [origin], log: () => {} });
    await bridge.ready;
    socket = new WebSocket(url, { origin });
    await once(socket, 'open'); // Real relay verifies the proxy-injected token and origin.
    const closed = once(socket, 'close'); socket.close(); await closed;
    await bridge.close();
    await offline();
    assert.deepEqual(errors, []);
  } finally { socket?.terminate(); await bridge.close(); await vite.close(); }
});
