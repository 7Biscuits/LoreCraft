import './styles.css';
import { BrowserRuntimeBridge } from './bridge/browserBridge';
import { bridgeOperations, dispatchRuntimeOperation } from './bridge/protocol';
import type { BridgeOperation } from './bridge/protocol';
import { loadGame } from './games/catalog';
import { defaultGameId } from './games/manifest';
import type { AuthoredGameHost } from './games/host';
import { captureConsole, inspectionOperations, recordLog, runtimeLogs } from './runtime/inspection';
import { playtest } from './studio/playtest';
import type { GeneratedGame } from './studio/generatedGame';

const parameters = new URLSearchParams(location.search);
const embedded = parameters.get('embedded') === '1';
const send = (type: string, data: unknown, requestId?: string) => {
  if (embedded && window.parent !== window) window.parent.postMessage({ source: 'lorecraft-player', type, data, requestId, previewId: parameters.get('previewId') }, location.origin);
};
if (parameters.has('stopped')) {
  document.body.textContent = 'LoreCraft runtime stopped. Launch a game through MCP to continue.';
} else {
  let host: AuthoredGameHost | undefined;
  let disposed = false;
  let failed = false;
  let initialized = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const restoreConsole = captureConsole();
  const report = () => {
    if (!host || disposed) return;
    const state = host.runtime.getGameState();
    if (!state.ok) return;
    const details = state.data.state ?? {};
    send('state', { snapshot: { score: state.data.score, health: typeof details.health === 'number' ? details.health : 1, outcome: details.outcome ?? 'playing', elapsed: details.elapsed ?? 0 },
      paused: host.isPaused, entities: host.runtime.listEntities(), logs: [...runtimeLogs], gameState: state.data });
  };
  const dispose = () => { if (disposed) return; disposed = true; clearInterval(timer); try { host?.destroy(); } finally { restoreConsole(); } };
  const bridgeUrl = new URL('/runtime-bridge', location.href); bridgeUrl.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const bridge = new BrowserRuntimeBridge(undefined, {
    url: bridgeUrl.href,
    identity: { sessionId: parameters.get('session') ?? 'manual', runtimeId: crypto.randomUUID(), gameId: parameters.get('game') ?? defaultGameId },
    onStatus: (message) => console.info(`[runtime bridge] ${message}`),
    beforeControl: () => host?.destroy(),
    onReplaced: () => { if (initialized) host?.pause(); report(); send('replaced', 'Another tab now controls the runtime. Reload or relaunch to reconnect.'); },
    onControl: (control) => {
      if (control.action === 'stop') {
        send('stopped', 'The agent stopped this game.'); bridge.disconnect(); dispose();
        if (!embedded) location.replace('about:blank');
        return;
      }
      const target = new URL(control.url!, location.href);
      if (target.origin !== location.origin || target.pathname !== '/') return;
      bridge.disconnect(); dispose();
      if (embedded) send('navigate', target.href); else location.replace(target.href);
    },
  });
  const reportError = (error: unknown) => {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    recordLog('error', message); bridge.setRuntimeStatus('error', message); send('error', message); console.error('Game failed:', message);
    if (!embedded) { const alert = document.createElement('div'); alert.className = 'runtime-error'; alert.textContent = `Game failed: ${message}`; document.body.append(alert); }
  };
  if (parameters.get('bridge') !== '0') bridge.connect();
  window.addEventListener('error', (event) => reportError(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
  window.addEventListener('pagehide', () => { bridge.disconnect(); dispose(); });
  window.addEventListener('blur', () => { if (embedded && initialized) { host?.pause(); report(); } });
  const touchKeys = new Set<string>();
  window.addEventListener('message', (event) => {
    if (!embedded || event.origin !== location.origin || event.source !== window.parent || event.data?.source !== 'lorecraft-studio' || !host || disposed) return;
    const { operation, args = {}, requestId } = event.data;
    try {
      let result: unknown;
      if (operation === 'touch') {
        if (!['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'shift', ' '].includes(args.key)) throw new Error('Invalid input.');
        if (args.down) touchKeys.add(args.key); else touchKeys.delete(args.key);
        host.setInput(touchKeys.size ? { x: Number(touchKeys.has('arrowright')) - Number(touchKeys.has('arrowleft')), y: Number(touchKeys.has('arrowup') || touchKeys.has(' ')) - Number(touchKeys.has('arrowdown')) } : undefined);
        result = { ok: true };
      } else if (bridgeOperations.includes(operation)) result = dispatchRuntimeOperation(operation as BridgeOperation, args, host.runtime);
      else throw new Error('This source-authored game does not support that studio operation.');
      report(); send('response', result, requestId);
    } catch (error) { send('response', { ok: false, error: { message: error instanceof Error ? error.message : String(error) } }, requestId); }
  });
  void Promise.all([loadGame(parameters.get('game') ?? defaultGameId), import('./games/host')]).then(async ([game, { AuthoredGameHost }]) => {
    if (disposed) return;
    host = new AuthoredGameHost(game, reportError, embedded ? { width: 960, height: 560 } : undefined);
    const runtime = await host.start();
    Object.assign(runtime, inspectionOperations(host, 'spec' in game ? () => ({ checks: playtest((game as GeneratedGame).spec) }) : undefined));
    // Wait for an actual rendered frame before claiming the embedded game is ready.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (failed || disposed) return;
    initialized = true;
    if (embedded) host.pause();
    bridge.setRuntime(runtime); send('ready', { title: game.title, gameId: game.id }); report();
    timer = setInterval(report, 500);
  }).catch(reportError);
}
