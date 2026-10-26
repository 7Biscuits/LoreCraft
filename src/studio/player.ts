import { AuthoredGameHost } from '../games/host';
import { GeneratedGame } from './generatedGame';
import { checkpointSchema, compilePrompt, examples, parseProject } from './spec';
import { BrowserRuntimeBridge } from '../bridge/browserBridge';
import { captureConsole, inspectionOperations, recordLog, runtimeLogs } from '../runtime/inspection';
import { dispatchRuntimeOperation, bridgeOperations } from '../bridge/protocol';
import type { BridgeOperation } from '../bridge/protocol';
import { playtest } from './playtest';

export async function startPlayer(): Promise<void> {
  const restoreConsole = captureConsole();
  document.body.className = 'player-page';
  const params = new URLSearchParams(location.search);
  const projectId = params.get('project');
  const projects = JSON.parse(localStorage.getItem('lorecraft.projects.v1') ?? '[]') as unknown[];
  const project = projects.map(parseProject).find((p) => p.id === projectId);
  const revision = project?.revisions.find((r) => r.id === (params.get('revision') ?? project.activeRevisionId));
  const spec = revision?.spec ?? compilePrompt(examples[0].prompt);
  const game = new GeneratedGame(spec);
  let bridge: BrowserRuntimeBridge | undefined;
  const send = (type: string, data: unknown, requestId?: string) => { if (window.parent !== window) window.parent.postMessage({ source: 'lorecraft-player', type, data, requestId }, location.origin); };
  const error = (cause: unknown) => { const message = cause instanceof Error ? cause.message : String(cause); recordLog('error', message); bridge?.setRuntimeStatus('error', message); send('error', message); };
  const host = new AuthoredGameHost(game, error);
  const runtime = await host.start();
  Object.assign(runtime, inspectionOperations(host, () => ({ checks: playtest(spec) })));
  host.pause(); game.render();
  let disposed = false;
  const report = () => send('state', { snapshot: game.engine.snapshot(), paused: host.isPaused, entities: runtime.listEntities(), logs: runtimeLogs });
  const keys = new Set<string>();
  function input() { game.input = { x: Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')), y: Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')), dash: keys.has('shift'), action: keys.has(' ') }; }
  const press = (event: KeyboardEvent, down: boolean) => {
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
    if (down) keys.add(event.key.toLowerCase()); else keys.delete(event.key.toLowerCase());
    input();
    if (down && !event.repeat && event.key.toLowerCase() === 'p') { if (host.isPaused) host.resume(); else host.pause(); report(); }
    if (down && !event.repeat && event.key.toLowerCase() === 'r') { runtime.resetGame(); game.render(); report(); }
  };
  window.addEventListener('keydown', (event) => press(event, true));
  window.addEventListener('keyup', (event) => press(event, false));
  window.addEventListener('blur', () => { keys.clear(); input(); host.pause(); report(); });
  window.addEventListener('error', (event) => error(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => error(event.reason));
  game.onFrame = () => { if (game.engine.state.tick % 10 === 0 || game.engine.state.outcome !== 'playing') report(); };
  const heartbeat = setInterval(report, 1000);
  const dispose = () => { if (disposed) return; disposed = true; clearInterval(heartbeat); bridge?.disconnect(); try { host.destroy(); } finally { restoreConsole(); } };
  window.addEventListener('pagehide', dispose);
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.source !== 'lorecraft-studio' || disposed) return;
    const { operation, args = {}, requestId } = event.data as { operation: string; args?: Record<string, unknown>; requestId?: string };
    try {
      let result: unknown;
      if (operation === 'restore') {
        const state = checkpointSchema.parse(args.state);
        game.restore(state); game.render(); result = { ok: true };
      } else if (operation === 'touch') {
        const key = args.key; if (typeof key !== 'string' || !['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'shift', ' '].includes(key)) return;
        if (args.down) keys.add(key); else keys.delete(key); input(); result = { ok: true };
      } else if (operation === 'stop') { dispose(); result = { ok: true }; }
      else if (bridgeOperations.includes(operation as BridgeOperation)) { result = dispatchRuntimeOperation(operation as BridgeOperation, args, runtime); if (operation === 'resetGame' || operation === 'stepGame' || operation.startsWith('setEntity')) game.render(); }
      else throw new Error('Unsupported preview operation.');
      // Publish the resulting state before resolving RPC so inspector/checkpoint actions see it.
      if (!disposed) report(); send('response', result, requestId);
    } catch (cause) { send('response', { ok: false, error: { message: cause instanceof Error ? cause.message : String(cause) } }, requestId); }
  });
  if (params.get('bridge') === '1') {
    const url = new URL('/runtime-bridge', location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    bridge = new BrowserRuntimeBridge(runtime, { url: url.href, identity: { sessionId: params.get('session') ?? 'manual', runtimeId: crypto.randomUUID(), gameId: 'generated-game' },
      onStatus: (message) => recordLog('info', message),
      beforeControl: () => host.destroy(), onReplaced: () => { host.pause(); report(); },
      onControl: (control) => { dispose(); location.replace(control.action === 'stop' ? 'about:blank' : control.url!); },
    });
    bridge.setRuntime(runtime); bridge.connect();
  }
  recordLog('info', `${spec.title} initialized. ${game.engine.state.entities.length} registry-backed entities.`);
  send('ready', { title: spec.title }); report();
}
