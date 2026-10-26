import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Preserve other workspace servers while deriving this server's cwd from the checkout. */
export function configureMcp(root = fileURLToPath(new URL('..', import.meta.url))) {
  const path = resolve(root, '.agents/mcp_config.json');
  let config = {};
  try { config = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  config.mcpServers ??= {};
  config.mcpServers['lorecraft-game'] = {
    ...config.mcpServers['lorecraft-game'],
    command: 'pnpm', args: ['mcp'], cwd: resolve(root),
    env: {
      MCP_BRIDGE_URL: 'ws://127.0.0.1:8787', MCP_BRIDGE_TIMEOUT_MS: '5000',
      ...config.mcpServers['lorecraft-game']?.env,
    },
    timeoutSeconds: config.mcpServers['lorecraft-game']?.timeoutSeconds ?? 30,
  };
  mkdirSync(resolve(root, '.agents'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  return path;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.info(`Configured Lorecraft MCP: ${configureMcp()}`);
}
