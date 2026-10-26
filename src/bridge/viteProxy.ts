import type { ProxyOptions } from 'vite';
import { readBridgeToken } from './access.ts';

/** Authentication stays in Node for both manual Vite and managed launches. */
export function runtimeProxy(port = Number(process.env.BRIDGE_PORT ?? 8787), token?: string): ProxyOptions {
  return {
    target: `ws://127.0.0.1:${port}`, ws: true,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    configure(proxy) {
      proxy.on('proxyReqWs', (request) => {
        try { request.setHeader('Authorization', `Bearer ${token ?? readBridgeToken()}`); }
        catch { request.destroy(new Error('Start the bridge before connecting the game.')); }
      });
    },
  };
}
