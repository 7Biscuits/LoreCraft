import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { BrowserRuntimeBridge } from '../bridge/browserBridge';
import { EntityRegistry, GameRuntime } from '../runtime';
import type { RuntimeLifecycleStatus } from '../lifecycle/manager';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

interface RpcResponse {
  id: number;
  error?: unknown;
  result?: { isError?: boolean; structuredContent?: { ok: boolean; result: unknown; error?: unknown } };
}

test('MCP lifecycle launches real servers, routes through Vite, reloads a fresh session, and closes on EOF', { timeout: 25000 }, async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), 'lorecraft-lifecycle-'));
  const bridgePort = await freePort();
  const vitePort = await freePort();
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/mcp/server.ts'], {
    cwd: root, stdio: ['pipe', 'pipe', 'pipe'], env: {
      ...process.env, BRIDGE_PORT: String(bridgePort), LORECRAFT_VITE_PORT: String(vitePort),
      MCP_BRIDGE_URL: `ws://127.0.0.1:${bridgePort}`, LORECRAFT_BRIDGE_TOKEN_FILE: join(directory, 'token'),
    },
  });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-12000); });
  const invalidLines: string[] = [];
  const pending = new Map<number, { resolve: (response: RpcResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let response: RpcResponse;
    try { response = JSON.parse(line) as RpcResponse; } catch { invalidLines.push(line); return; }
    const waiter = pending.get(response.id);
    if (waiter) { clearTimeout(waiter.timer); pending.delete(response.id); waiter.resolve(response); }
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(stderr)); }
      pending.clear(); resolve(code);
    });
  });
  let id = 0;
  const rpc = (method: string, params: unknown) => new Promise<RpcResponse>((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Timed out ${method}: ${stderr}`)); }, 18000);
    pending.set(requestId, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
  });
  const call = async (name: string, args = {}) => {
    const response = await rpc('tools/call', { name, arguments: args });
    assert.equal(response.error, undefined);
    assert.equal(response.result?.isError, false, JSON.stringify(response.result));
    return response.result!.structuredContent!.result;
  };
  let browser: BrowserRuntimeBridge | undefined;
  const connectDocument = (url: string) => {
    const page = new URL(url);
    const socketUrl = new URL('/runtime-bridge', page);
    socketUrl.protocol = 'ws:';
    class BrowserSocket extends WebSocket {
      constructor(url: string) { super(url, { origin: page.origin }); }
    }
    const runtime = new GameRuntime(new EntityRegistry(), {
      createEntity: () => ({ ok: false, error: { code: 'OPERATION_FAILED', message: 'unused' } }),
      getGameState: () => ({ mode: 'maze-escape', score: 0 }), resetGame: () => {},
    });
    browser = new BrowserRuntimeBridge(undefined, {
      url: socketUrl.href, WebSocketConstructor: BrowserSocket as unknown as typeof globalThis.WebSocket,
      identity: { gameId: page.searchParams.get('game')!, sessionId: page.searchParams.get('session')!, runtimeId: crypto.randomUUID() },
      onControl: (control) => { browser?.disconnect(); if (control.action === 'navigate') connectDocument(control.url!); },
    });
    browser.setRuntime(runtime); browser.connect();
  };
  try {
    await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'lifecycle-test', version: '1' } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const launch = call('launch_game', { gameId: 'maze-escape', openBrowser: false });
    let readyUrl: string | undefined;
    for (let attempt = 0; attempt < 150; attempt++) {
      const status = await call('get_runtime_status') as RuntimeLifecycleStatus;
      if (status.url) { readyUrl = status.url; break; }
      if (status.state === 'error') assert.fail(JSON.stringify(status));
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.ok(readyUrl, `No launch URL was returned. ${stderr}`);
    const page = await fetch(readyUrl);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /src\/main.ts/);
    connectDocument(readyUrl);
    const launched = await launch as RuntimeLifecycleStatus;
    assert.equal(launched.state, 'ready');
    assert.equal((await call('get_game_state') as { mode: string }).mode, 'maze-escape');
    const reloaded = await call('reload_game') as RuntimeLifecycleStatus;
    assert.equal(reloaded.state, 'ready');
    assert.notEqual(reloaded.sessionId, launched.sessionId);
    // Ending the stdio session must release Vite, relay sockets, and owned resources.
    child.stdin.end();
    const exitTimer = setTimeout(() => child.kill('SIGKILL'), 4000);
    try { assert.equal(await exited, 0, stderr); } finally { clearTimeout(exitTimer); }
    assert.deepEqual(invalidLines, []);
    await assert.rejects(fetch(`http://127.0.0.1:${vitePort}`));
  } finally {
    browser?.disconnect();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited; lines.close();
    for (const waiter of pending.values()) clearTimeout(waiter.timer);
    rmSync(directory, { recursive: true });
  }
});
