import './styles.css';
import { BrowserRuntimeBridge } from './bridge/browserBridge';
import { loadGame } from './games/catalog';
import { defaultGameId } from './games/manifest';
import type { AuthoredGameHost } from './games/host';
import { captureConsole, inspectionOperations, recordLog } from './runtime/inspection';
import { playtest } from './studio/playtest';
import type { GeneratedGame } from './studio/generatedGame';

const bridgeUrl = new URL('/runtime-bridge', window.location.href);
bridgeUrl.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

const parameters = new URLSearchParams(window.location.search);
if (parameters.has('stopped')) {
  document.body.textContent = 'Lorecraft runtime stopped. Launch a game through MCP to continue.';
} else {
  let host: AuthoredGameHost | undefined;
  const restoreConsole = captureConsole();
  const bridge = new BrowserRuntimeBridge(undefined, {
    url: bridgeUrl.href,
    identity: {
      sessionId: parameters.get('session') ?? 'manual',
      runtimeId: crypto.randomUUID(),
      gameId: parameters.get('game') ?? defaultGameId,
    },
    onStatus: (message) => console.info(`[runtime bridge] ${message}`),
    beforeControl: () => host?.destroy(),
    onReplaced: () => host?.pause(),
    onControl: (control) => {
      if (control.action === 'stop') {
        bridge.disconnect();
        try { host?.destroy(); } finally { window.location.replace('about:blank'); }
        return;
      }
      const target = new URL(control.url!, window.location.href);
      if (target.origin !== window.location.origin || target.pathname !== '/') return;
      bridge.disconnect();
      try { host?.destroy(); } finally { window.location.replace(target.href); }
    },
  });
  const reportError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    recordLog('error', message);
    bridge.setRuntimeStatus('error', message);
    console.error('Game failed:', message);
  };
  bridge.connect();
  window.addEventListener('error', (event) => reportError(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
  window.addEventListener('pagehide', () => { bridge.disconnect(); try { host?.destroy(); } finally { restoreConsole(); } });
  // Import engine code after connecting so import/initialization failures can be reported.
  void Promise.all([loadGame(parameters.get('game') ?? defaultGameId), import('./games/host')]).then(async ([game, { AuthoredGameHost }]) => {
    host = new AuthoredGameHost(game, reportError);
    const runtime = await host.start();
    Object.assign(runtime, inspectionOperations(host, 'spec' in game ? () => ({ checks: playtest((game as GeneratedGame).spec) }) : undefined));
    bridge.setRuntime(runtime);
  }).catch(reportError);
}
