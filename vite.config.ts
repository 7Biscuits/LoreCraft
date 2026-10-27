import { defineConfig, loadEnv } from 'vite';
import { runtimeProxy } from './src/bridge/viteProxy.ts';
import { generatorOptionsFromEnv, studioApi } from './src/studio/api.ts';
import { agentStatusApi } from './src/studio/agentApi.ts';
import { sourceExportApi } from './src/studio/sourceExport.ts';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
  plugins: [agentStatusApi(), sourceExportApi(), studioApi(generatorOptionsFromEnv(env))],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true, fs: { deny: ['.env', '.env.*', '**/.git/**', '**/.lorecraft/**', '**/*.sqlite', '**/*.sqlite-*', '**/.agents/**', '**/.codex/**', '**/bridge-token', '*.{crt,pem,key,p12,pfx}'] }, proxy: { '/runtime-bridge': runtimeProxy(Number(env.BRIDGE_PORT ?? 8787)) } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy: { '/runtime-bridge': runtimeProxy(Number(env.BRIDGE_PORT ?? 8787)) } },
};
});
