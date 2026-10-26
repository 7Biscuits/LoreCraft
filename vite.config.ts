import { defineConfig } from 'vite';
import { runtimeProxy } from './src/bridge/viteProxy.ts';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/runtime-bridge': runtimeProxy() } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy: { '/runtime-bridge': runtimeProxy() } },
});
