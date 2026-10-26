import type { ProxyOptions } from 'vite';
import { readBridgeToken } from './access.ts';

/** Authentication stays in Node for both manual Vite and managed launches. */
export function runtimeProxy(port = Number(process.env.BRIDGE_PORT ?? 8787), token?: string): ProxyOptions {
  return {
    target: `ws://127.0.0.1:${port}`, ws: true,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    async bypass() {
      // Older tabs can reconnect without the browser availability check. Reject
      // upgrades before Vite opens an upstream socket when the relay is offline.
      try {
        const response = await fetch(`http://127.0.0.1:${port}/agent-status`, {
          headers: { Authorization: `Bearer ${token ?? readBridgeToken()}` },
          signal: AbortSignal.timeout(800), cache: 'no-store',
        });
        if (!response.ok) return false;
        const status = await response.json();
        if (status.connected !== true) return false;
      } catch { return false; }
    },
    configure(proxy) {
      proxy.on('proxyReqWs', (request) => {
        try { request.setHeader('Authorization', `Bearer ${token ?? readBridgeToken()}`); }
        catch { request.destroy(new Error('Start the bridge before connecting the game.')); }
      });
    },
  };
}
