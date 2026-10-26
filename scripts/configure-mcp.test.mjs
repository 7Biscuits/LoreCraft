import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureMcp } from './configure-mcp.mjs';

test('MCP setup derives cwd from the checkout and preserves other server settings', () => {
  const root = mkdtempSync(join(tmpdir(), 'Lorecraft checkout '));
  mkdirSync(join(root, '.agents'));
  writeFileSync(join(root, '.agents/mcp_config.json'), JSON.stringify({
    mcpServers: { other: { command: 'other' }, 'lorecraft-game': { cwd: '/stale', env: { MCP_BRIDGE_TIMEOUT_MS: '10000' } } },
  }));
  try {
    const path = configureMcp(root);
    const first = readFileSync(path, 'utf8');
    const config = JSON.parse(first);
    assert.equal(config.mcpServers['lorecraft-game'].cwd, root);
    assert.deepEqual(config.mcpServers.other, { command: 'other' });
    assert.equal(config.mcpServers['lorecraft-game'].env.MCP_BRIDGE_TIMEOUT_MS, '10000');
    configureMcp(root);
    assert.equal(readFileSync(path, 'utf8'), first);
  } finally { rmSync(root, { recursive: true }); }
});
