import { defineConfig } from 'vite';
import type { ProxyOptions } from 'vite';
import { readBridgeToken } from './src/bridge/access.ts';

const runtimeProxy: ProxyOptions = {
  target: `ws://127.0.0.1:${process.env.BRIDGE_PORT ?? 8787}`,
  ws: true,
  configure(proxy) {
    proxy.on('proxyReqWs', (request) => {
      try { request.setHeader('Authorization', `Bearer ${readBridgeToken()}`); }
      catch { request.destroy(new Error('Start pnpm bridge before connecting the game.')); }
    });
  },
};

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/runtime-bridge': runtimeProxy } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy: { '/runtime-bridge': runtimeProxy } },
});
