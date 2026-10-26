import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { BrowserRuntimeBridge } from '../bridge/browserBridge';
import { RuntimeBridgeServer } from '../bridge/server';
import { bridgeCloseCodes } from '../bridge/protocol';
import { GameBridgeClient } from '../mcp/bridgeClient';
import { EntityRegistry, GameRuntime } from '../runtime';
import { RuntimeLifecycleManager } from './manager';
import type { LifecycleOptions } from './manager';

const token = 'lifecycle-test-token';
class AuthenticatedSocket extends WebSocket {
  constructor(url: string) { super(url, { headers: { Authorization: `Bearer ${token}` } }); }
}

function fixture(options: LifecycleOptions = {}) {
  let port = 0;
  let builds = 0;
  let closes = 0;
  let buildError: string | undefined;
  let browser: BrowserRuntimeBridge | undefined;
  let observer: ReturnType<typeof setInterval> | undefined;
  let connectedSession: string | null;
  let observe = false;
  const runtime = new GameRuntime(new EntityRegistry(), {
    createEntity: () => ({ ok: false, error: { code: 'OPERATION_FAILED', message: 'unused' } }),
    getGameState: () => ({ mode: 'maze-escape', score: 0 }), resetGame: () => {},
  });
  const connect = (url: string, error?: string) => {
    const page = new URL(url);
    connectedSession = page.searchParams.get('session');
    browser = new BrowserRuntimeBridge(undefined, {
      url: `ws://127.0.0.1:${port}`, WebSocketConstructor: AuthenticatedSocket as unknown as typeof globalThis.WebSocket,
      identity: { gameId: page.searchParams.get('game')!, sessionId: page.searchParams.get('session')!, runtimeId: crypto.randomUUID() },
      onControl: (control) => {
        browser?.disconnect();
        if (control.action === 'navigate') connect(control.url!);
      },
    });
    if (error) browser.setRuntimeStatus('error', error);
    else browser.setRuntime(runtime);
    browser.connect();
  };
  const manager = new RuntimeLifecycleManager({
    bridgePort: 0, token, readyTimeoutMs: 500,
    validateSource: async () => { builds++; if (buildError) throw new Error(buildError); },
    startDevServer: async (bridgePort) => { port = bridgePort; observer = setInterval(() => { const activity = manager.getActivity(); if (observe && activity?.runtimeUrl && new URL(activity.runtimeUrl).searchParams.get('session') !== connectedSession) connect(activity.runtimeUrl); }, 10); return { url: 'http://127.0.0.1:5173', close: async () => { clearInterval(observer); closes++; } }; },
    openBrowser: async (url) => { observe = true; connect(url); },
    ...options,
  });
  return { manager, connect, get builds() { return builds; }, get closes() { return closes; },
    get port() { return port; }, setBuildError: (message?: string) => { buildError = message; },
    disconnect: () => browser?.disconnect(),
  };
}

test('launch, inspect, reload, stop, and repeated launch preserve ownership and fresh sessions', { timeout: 5000 }, async () => {
  const f = fixture();
  const { manager } = f;
  let client: GameBridgeClient | undefined;
  try {
    assert.equal(manager.listGames()[0]?.id, 'maze-escape');
    assert.equal((await manager.launchGame()).ok, true);
    const initial = manager.getStatus();
    assert.equal(initial.state, 'ready');
    assert.equal((await manager.launchGame()).ok, true);
    assert.equal(f.builds, 1);
    client = new GameBridgeClient({ url: `ws://127.0.0.1:${f.port}`, token });
    assert.equal((await client.request('getGameState', {})).ok, true);
    assert.equal((await manager.reloadGame()).ok, true);
    assert.notEqual(manager.getStatus().sessionId, initial.sessionId);
    assert.notEqual(manager.getStatus().runtimeId, initial.runtimeId);
    const stale = new AuthenticatedSocket(`ws://127.0.0.1:${f.port}`);
    await once(stale, 'open');
    const rejected = once(stale, 'close');
    stale.send(JSON.stringify({ kind: 'hello', role: 'runtime', identity: {
      sessionId: initial.sessionId, runtimeId: 'stale', gameId: 'maze-escape',
    } }));
    assert.equal((await rejected)[0], bridgeCloseCodes.sessionRejected);
    assert.equal((await client.request('getGameState', {})).ok, true);
    assert.equal((await manager.stopGame()).ok, true);
    assert.equal(manager.getStatus().ownsServers, false);
    assert.equal((await manager.stopGame()).ok, true);
    assert.equal(f.closes, 1);
    assert.equal((await manager.launchGame()).ok, true);
    assert.equal((await manager.stopGame()).ok, true);
    assert.equal(f.closes, 2);
  } finally { f.disconnect(); await client?.close(); await manager.stopGame(); }
});

test('validation errors prevent launch and leave a ready game available after a failed reload', async () => {
  const f = fixture();
  try {
    f.setBuildError('TS2305: missing export');
    const failed = await f.manager.launchGame();
    assert.equal(failed.ok, false);
    if (!failed.ok) assert.match(failed.error.message, /TS2305/);
    assert.equal(f.manager.getStatus().ownsServers, true); // Studio remains available to display the build error.
    f.setBuildError();
    assert.equal((await f.manager.launchGame()).ok, true);
    const before = f.manager.getStatus().sessionId;
    f.setBuildError('TS1005: syntax error');
    assert.equal((await f.manager.reloadGame()).ok, false);
    assert.equal(f.manager.getStatus().sessionId, before);
    assert.equal(f.manager.getStatus().state, 'ready');
  } finally { f.disconnect(); await f.manager.stopGame(); }
});

test('readiness timeout and initialization failures clean up owned servers', async () => {
  const timedOut = fixture({ readyTimeoutMs: 40 });
  try {
    const result = await timedOut.manager.launchGame(undefined, false);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'RUNTIME_TIMEOUT');
    assert.equal(timedOut.closes, 0);
    assert.equal(timedOut.manager.getStatus().ownsServers, true);
  } finally { await timedOut.manager.stopGame(); }
  const failed = fixture({ openBrowser: async (url) => { failed.connect(url, 'init exploded'); } });
  try {
    const result = await failed.manager.launchGame();
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.error.code, 'RUNTIME_ERROR'); assert.match(result.error.message, /init exploded/); }
    assert.equal(failed.manager.getStatus().ownsServers, true);
  } finally { failed.disconnect(); await failed.manager.stopGame(); }
});

test('stop cancels a pending launch and concurrent operations return structured errors', async () => {
  const f = fixture({ readyTimeoutMs: 10000 });
  try {
    assert.equal(f.manager.selectGame('../elsewhere').ok, false);
    const launch = f.manager.launchGame(undefined, false);
    assert.equal((await f.manager.reloadGame()).ok, false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const stopped = f.manager.stopGame();
    assert.equal((await launch).ok, false);
    assert.equal((await stopped).ok, true);
    assert.equal(f.manager.getStatus().state, 'stopped');
    assert.equal(f.manager.getStatus().ownsServers, false);
  } finally { await f.manager.stopGame(); }
});

test('an occupied bridge is reported and a manually started server remains running', async () => {
  const manual = new RuntimeBridgeServer({ port: 0, token, log: () => {} });
  await manual.ready;
  const f = fixture({ bridgePort: manual.port });
  try {
    const result = await f.manager.launchGame();
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error.message, /EADDRINUSE/);
    await f.manager.stopGame();
    const client = new GameBridgeClient({ url: `ws://127.0.0.1:${manual.port}`, token });
    const response = await client.request('getGameState', {});
    assert.equal(response.ok, false);
    if (!response.ok) assert.equal(response.error.code, 'RUNTIME_UNAVAILABLE');
    await client.close();
  } finally { await f.manager.stopGame(); await manual.close(); }
});

test('creation opens the studio before validation and publishes authenticated, bounded progress', async () => {
  const f = fixture();
  try {
    const result = await f.manager.beginCreation('super-mario', 'Mario in progress', 'Create a platformer', false);
    assert.equal(result.ok, true); assert.equal(f.builds, 0);
    assert.equal(new URL(f.manager.getStatus().url!).searchParams.get('studio'), '1');
    assert.equal(f.manager.getActivity()?.stage, 'authoring');
    assert.equal(f.manager.getActivity()?.runtimeUrl, undefined);
    assert.equal(f.manager.updateCreation('wrong-game', 'authoring', 'wrong').ok, false);
    for (let i = 0; i < 40; i++) f.manager.updateCreation('super-mario', 'authoring', `Writing section ${i}`);
    assert.equal(f.manager.getActivity()?.events.length, 30);
    const base = `http://127.0.0.1:${f.port}/agent-status`;
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { headers: { Authorization: `Bearer ${token}`, Origin: 'https://untrusted.example' } })).status, 403);
    const status = await (await fetch(base, { headers: { Authorization: `Bearer ${token}` } })).json() as { activity: { stage: string; message: string; prompt: string } };
    assert.equal(status.activity.stage, 'authoring'); assert.equal(status.activity.message, 'Writing section 39'); assert.equal(status.activity.prompt, 'Create a platformer');
    assert.equal(JSON.stringify(status).includes(token), false);
    const launching = f.manager.launchGame('super-mario', false);
    await new Promise((resolve) => setTimeout(resolve, 20)); f.connect(f.manager.getActivity()!.runtimeUrl!);
    assert.equal((await launching).ok, true);
    assert.equal(f.manager.getActivity()?.stage, 'ready'); assert.ok(f.manager.getActivity()?.runtimeUrl?.includes('embedded=1'));
  } finally { f.disconnect(); await f.manager.stopGame(); }
});
