import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { RuntimeBridgeServer } from '../bridge/server';
import { runtimeProxy } from '../bridge/viteProxy';
import type { RuntimeIdentity } from '../bridge/protocol';
import { defaultGameId } from '../games/manifest';
import { readGameCatalog } from '../games/readManifest';
import type { AgentActivity } from '../studio/agentState';
import { openBrowser, validateSource } from './processes';

export interface RuntimeLifecycleStatus {
  state: 'stopped' | 'starting' | 'waiting' | 'ready' | 'error';
  selectedGameId: string;
  sessionId?: string;
  runtimeId?: string;
  url?: string;
  message?: string;
  diagnostics: string[];
  ownsServers: boolean;
  activity?: AgentActivity;
}

export type LifecycleResult =
  | { ok: true; result: RuntimeLifecycleStatus }
  | { ok: false; error: { code: 'INVALID_GAME' | 'LIFECYCLE_BUSY' | 'LAUNCH_FAILED' | 'RELOAD_FAILED' | 'RUNTIME_TIMEOUT' | 'RUNTIME_ERROR' | 'CANCELLED' | 'NOT_RUNNING' | 'STOP_FAILED'; message: string }; status: RuntimeLifecycleStatus };

interface DevServer {
  url: string;
  close(): Promise<void>;
}

export interface LifecycleOptions {
  root?: string;
  bridgePort?: number;
  vitePort?: number;
  readyTimeoutMs?: number;
  token?: string;
  validateSource?: typeof validateSource;
  openBrowser?: typeof openBrowser;
  startDevServer?: (bridgePort: number, diagnostic: (message: string) => void) => Promise<DevServer>;
}

/** Owns only servers it creates. Browser code and gameplay remain behind the existing bridge. */
export class RuntimeLifecycleManager {
  private selectedGameId = defaultGameId;
  private bridge?: RuntimeBridgeServer;
  private devServer?: DevServer;
  private sessionId?: string;
  private url?: string;
  private state: RuntimeLifecycleStatus['state'] = 'stopped';
  private message?: string;
  private readonly diagnostics: string[] = [];
  private action?: Promise<LifecycleResult>;
  private cancellation?: AbortController;
  private stopping?: Promise<LifecycleResult>;
  private readonly root: string;
  private readonly vitePort: number;
  private activity?: AgentActivity;
  private runtimePublished = false;
  private studioOpened = false;

  constructor(private readonly options: LifecycleOptions = {}) {
    this.root = options.root ?? fileURLToPath(new URL('../../', import.meta.url));
    this.vitePort = options.vitePort ?? Number(process.env.LORECRAFT_VITE_PORT ?? 5173);
  }

  listGames() { return readGameCatalog(this.root).map(({ id, title }) => ({ id, title })); }

  getActivity(): AgentActivity | undefined {
    const presence = this.bridge?.runtimeStatus;
    if (this.activity && this.runtimePublished && presence && presence.sessionId === this.sessionId) {
      if (presence.state === 'ready' && this.activity.stage === 'loading') this.progress('ready', 'Game initialized. Ready to play in the preview.');
      if (presence.state === 'error' && this.activity.stage !== 'error') this.progress('error', presence.message ?? 'The game failed to initialize.');
    }
    return this.activity ? { ...this.activity, events: [...this.activity.events], studioUrl: this.url, runtimeUrl: this.runtimePublished && this.devServer ? this.gameUrl() : undefined } : undefined;
  }

  beginCreation(gameId: string, title: string, prompt: string, open = true): Promise<LifecycleResult> {
    return this.run(async (signal) => {
      if (!/^[a-z0-9-]{1,128}$/.test(gameId)) return this.fail('INVALID_GAME', 'Use a valid lowercase game ID.');
      if (this.bridge) await this.bridge.controlRuntimeAcknowledged({ kind: 'control', action: 'stop' });
      this.selectedGameId = gameId; this.runtimePublished = false; this.sessionId = randomUUID();
      this.activity = { jobId: randomUUID(), gameId, title: title.slice(0, 120), prompt: prompt.slice(0, 4000), stage: 'planning', message: '', events: [], updatedAt: new Date().toISOString() };
      this.progress('planning', 'Creation requested through MCP. Preparing the workspace.');
      this.state = 'starting';
      try {
        await this.ensureServers(signal); await this.showStudio(open);
        this.progress('authoring', 'Waiting for the coding agent to write the game.');
        return this.success();
      } catch (error) { return this.failedAction(error, signal, 'LAUNCH_FAILED'); }
    });
  }

  updateCreation(gameId: string, stage: 'planning' | 'authoring' | 'testing' | 'error', message: string): LifecycleResult {
    if (!this.activity || this.activity.gameId !== gameId) return this.fail('INVALID_GAME', 'Call begin_game_creation for this game first.');
    if (this.action || this.stopping || this.runtimePublished) return this.fail('LIFECYCLE_BUSY', 'Source progress is only accepted before launch.');
    this.progress(stage, message); return this.success();
  }

  getStatus(): RuntimeLifecycleStatus {
    const presence = this.bridge?.runtimeStatus;
    const matching = presence?.sessionId === this.sessionId && presence?.gameId === this.selectedGameId;
    const state = this.state === 'waiting' || this.state === 'ready'
      ? matching ? presence.state : 'waiting'
      : this.state;
    return {
      state: state === 'initializing' ? 'waiting' : state,
      selectedGameId: this.selectedGameId, sessionId: this.sessionId,
      runtimeId: matching ? presence.runtimeId : undefined,
      url: this.url, message: matching && presence.message ? presence.message : this.message,
      diagnostics: [...this.diagnostics], ownsServers: Boolean(this.bridge || this.devServer),
      activity: this.getActivity(),
    };
  }

  selectGame(gameId: string): LifecycleResult {
    if (this.action || this.stopping) return this.fail('LIFECYCLE_BUSY', 'Wait for the current lifecycle action or stop it first.');
    if (!this.listGames().some((game) => game.id === gameId)) return this.fail('INVALID_GAME', `Unknown game "${gameId}". Call list_games for registered games.`);
    if (this.bridge && gameId !== this.selectedGameId) return this.fail('LIFECYCLE_BUSY', 'Stop the current game before selecting another, or call launch_game with its gameId.');
    this.selectedGameId = gameId;
    return this.success();
  }

  launchGame(gameId = this.selectedGameId, open = true): Promise<LifecycleResult> {
    try { if (!this.listGames().some((game) => game.id === gameId)) { this.progress('error', `Unknown game "${gameId}". Register it in the manifest before launch.`); return Promise.resolve(this.fail('INVALID_GAME', `Unknown game "${gameId}". Register it in the manifest before launch.`)); } }
    catch (error) { this.progress('error', this.errorMessage(error)); return Promise.resolve(this.fail('INVALID_GAME', this.errorMessage(error))); }
    return this.run(async (signal) => {
      if (this.bridge && this.devServer && gameId === this.selectedGameId && this.getStatus().state === 'ready') return this.success();
      if (this.bridge) await this.bridge.controlRuntimeAcknowledged({ kind: 'control', action: 'stop' });
      this.selectedGameId = gameId;
      this.runtimePublished = false;
      this.sessionId = randomUUID();
      if (!this.activity || this.activity.gameId !== gameId || this.activity.stage === 'ready' || this.activity.stage === 'stopped') {
        this.activity = { jobId: randomUUID(), gameId, title: this.listGames().find((g) => g.id === gameId)?.title ?? gameId, prompt: '', stage: 'planning', message: '', events: [], updatedAt: new Date().toISOString() };
      }
      this.diagnostics.length = 0;
      this.state = 'starting'; this.message = 'Validating game source.';
      try {
        await this.ensureServers(signal);
        await this.showStudio(open);
        this.progress('validating', 'Type-checking and building the game source.');
        await (this.options.validateSource ?? validateSource)(this.root, signal);
        signal.throwIfAborted();
        this.runtimePublished = true;
        this.state = 'waiting'; this.message = 'Waiting for browser game initialization.';
        this.progress('loading', 'Build passed. Loading the game into the studio preview.');
        await this.waitUntilReady(signal);
        this.state = 'ready'; this.message = undefined;
        this.progress('ready', 'Game initialized. Ready to play in the preview.');
        return this.success();
      } catch (error) {
        return this.failedAction(error, signal, 'LAUNCH_FAILED');
      }
    });
  }

  reloadGame(): Promise<LifecycleResult> {
    return this.run(async (signal) => {
      if (!this.bridge || !this.devServer) return this.fail('NOT_RUNNING', 'Launch a managed game before reloading.');
      try {
        this.progress('validating', 'Validating edited source. The previous game remains available.');
        await (this.options.validateSource ?? validateSource)(this.root, signal);
        signal.throwIfAborted();
        const previousSession = this.sessionId;
        this.sessionId = randomUUID();
        const url = this.gameUrl();
        if (!this.bridge.controlRuntime({ kind: 'control', action: 'navigate', url })) {
          this.sessionId = previousSession;
          return this.fail('NOT_RUNNING', 'The browser disconnected. Stop and launch the game again.');
        }
        this.url = url; this.state = 'waiting'; this.message = 'Waiting for the reloaded document.';
        this.url = this.studioUrl(); this.runtimePublished = true;
        this.progress('loading', 'Loading the rebuilt game into the preview.');
        await this.waitUntilReady(signal);
        this.state = 'ready'; this.message = undefined;
        this.progress('ready', 'Reload complete. Ready to play.');
        return this.success();
      } catch (error) {
        // Compilation failure leaves the currently running game available for inspection.
        if (this.getStatus().state === 'ready' && !signal.aborted) {
          this.diagnostic(this.errorMessage(error));
          this.progress('error', this.errorMessage(error));
          return this.fail('RELOAD_FAILED', this.errorMessage(error));
        }
        return this.failedAction(error, signal, 'RELOAD_FAILED');
      }
    });
  }

  stopGame(): Promise<LifecycleResult> {
    if (this.stopping) return this.stopping;
    this.cancellation?.abort();
    this.stopping = (async () => {
      await this.action;
      try {
        await this.release();
        this.state = 'stopped'; this.message = undefined;
        this.progress('stopped', 'The agent stopped the managed game.');
        return this.success();
      } catch (error) {
        this.state = 'error';
        return this.fail('STOP_FAILED', this.errorMessage(error));
      }
    })().finally(() => { this.stopping = undefined; });
    return this.stopping;
  }

  private run(action: (signal: AbortSignal) => Promise<LifecycleResult>): Promise<LifecycleResult> {
    if (this.action || this.stopping) return Promise.resolve(this.fail('LIFECYCLE_BUSY', 'Another lifecycle operation is running. Use stop_game to cancel a launch.'));
    const controller = new AbortController();
    this.cancellation = controller;
    const pending = Promise.resolve().then(() => action(controller.signal)).catch((error: unknown) => this.failedAction(error, controller.signal, 'LAUNCH_FAILED'));
    this.action = pending;
    void pending.finally(() => { if (this.action === pending) { this.action = undefined; this.cancellation = undefined; } });
    return pending;
  }

  private acceptRuntime(identity: RuntimeIdentity | undefined): boolean {
    return Boolean(identity && identity.sessionId === this.sessionId && identity.gameId === this.selectedGameId);
  }

  private gameUrl(): string {
    const url = new URL('/', this.devServer!.url);
    url.searchParams.set('game', this.selectedGameId);
    url.searchParams.set('session', this.sessionId!);
    url.searchParams.set('embedded', '1');
    return url.href;
  }

  private studioUrl(): string { const url = new URL(this.gameUrl()); url.searchParams.delete('embedded'); url.searchParams.set('studio', '1'); return url.href; }
  private progress(stage: AgentActivity['stage'], message: string): void {
    if (!this.activity) return;
    const timestamp = new Date().toISOString();
    this.activity = { ...this.activity, stage, message: message.slice(-4000), updatedAt: timestamp,
      events: [...this.activity.events, { stage, message: message.slice(-4000), timestamp }].slice(-30) };
  }
  private async ensureServers(signal: AbortSignal): Promise<void> {
    if (!this.bridge) this.bridge = new RuntimeBridgeServer({ port: this.options.bridgePort ?? Number(process.env.BRIDGE_PORT ?? 8787), token: this.options.token,
      log: (message) => this.diagnostic(message), acceptRuntime: (identity) => this.acceptRuntime(identity), allowedOrigins: [`http://127.0.0.1:${this.vitePort}`], getStudioActivity: () => this.getActivity() });
    await this.bridge.ready; signal.throwIfAborted();
    this.devServer ??= await (this.options.startDevServer?.(this.bridge.port, (message) => this.diagnostic(message)) ?? this.startVite(this.bridge.port));
    signal.throwIfAborted(); this.url = this.studioUrl();
  }
  private async showStudio(open: boolean): Promise<void> {
    if (!open || this.studioOpened) return;
    try { await (this.options.openBrowser ?? openBrowser)(this.url!); this.studioOpened = true; }
    catch (error) { this.diagnostic(this.errorMessage(error)); }
  }

  private async waitUntilReady(signal: AbortSignal): Promise<void> {
    const deadline = Date.now() + (this.options.readyTimeoutMs ?? 15000);
    while (true) {
      signal.throwIfAborted();
      const presence = this.bridge?.runtimeStatus;
      if (presence && presence.sessionId === this.sessionId) {
        if (presence.state === 'error') throw new LifecycleFailure('RUNTIME_ERROR', presence.message ?? 'Game initialization failed.');
        if (presence.state === 'ready') return;
      }
      if (Date.now() >= deadline) throw new LifecycleFailure('RUNTIME_TIMEOUT', `Game did not become ready. Open ${this.url} and inspect runtime diagnostics.`);
      await new Promise<void>((resolve) => {
        const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
        const timer = setTimeout(finish, 25);
        signal.addEventListener('abort', finish, { once: true });
      });
    }
  }

  private async startVite(bridgePort: number): Promise<DevServer> {
    const { createServer, createLogger } = await import('vite');
    const logger = createLogger('silent');
    logger.info = (message) => this.diagnostic(message);
    logger.warn = (message) => this.diagnostic(message);
    logger.error = (message) => this.diagnostic(message);
    const server = await createServer({
      root: this.root, customLogger: logger,
      server: {
        host: '127.0.0.1', port: this.vitePort, strictPort: true,
        proxy: { '/runtime-bridge': runtimeProxy(bridgePort, this.options.token) },
      },
    });
    try { await server.listen(); }
    catch (error) { await server.close(); throw error; }
    server.watcher.on('all', (_event, path) => {
      if (this.activity && ['planning', 'authoring', 'testing'].includes(this.activity.stage) && path.replaceAll('\\', '/').includes(`/src/games/${this.selectedGameId}/`)) this.progress('authoring', `Source updated: ${path.split('/').pop()}.`);
    });
    return { url: `http://127.0.0.1:${this.vitePort}`, close: () => server.close() };
  }

  private async release(): Promise<void> {
    this.sessionId = undefined;
    this.runtimePublished = false; this.studioOpened = false;
    if (this.bridge && !(await this.bridge.controlRuntimeAcknowledged({ kind: 'control', action: 'stop' }))) {
      this.diagnostic('Browser teardown could not be confirmed. Close any disconnected game tab; owned servers will still be released.');
    }
    const bridge = this.bridge; const devServer = this.devServer;
    const results = await Promise.allSettled([devServer?.close(), bridge?.close()]);
    if (results[0]?.status === 'fulfilled') this.devServer = undefined;
    if (results[1]?.status === 'fulfilled') this.bridge = undefined;
    if (!this.bridge && !this.devServer) this.url = undefined;
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }

  private async failedAction(error: unknown, signal: AbortSignal, fallback: 'LAUNCH_FAILED' | 'RELOAD_FAILED'): Promise<LifecycleResult> {
    const message = signal.aborted ? 'Lifecycle operation cancelled.' : this.errorMessage(error);
    this.diagnostic(message);
    this.progress('error', message);
    // Keep a successfully opened studio alive so the user can see failures and agent repairs.
    if (signal.aborted || !this.bridge || !this.devServer) {
      try { await this.release(); } catch (cleanup) { this.diagnostic(`Cleanup failed: ${this.errorMessage(cleanup)}`); }
    }
    this.state = signal.aborted ? 'stopped' : 'error'; this.message = message;
    return this.fail(signal.aborted ? 'CANCELLED' : error instanceof LifecycleFailure ? error.code : fallback, message);
  }

  private diagnostic(message: string): void {
    this.diagnostics.push(message.slice(-4000));
    if (this.diagnostics.length > 20) this.diagnostics.shift();
  }

  private errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
  private success(): LifecycleResult { return { ok: true, result: this.getStatus() }; }
  private fail(code: Extract<LifecycleResult, { ok: false }>['error']['code'], message: string): LifecycleResult {
    return { ok: false, error: { code, message }, status: this.getStatus() };
  }
}

class LifecycleFailure extends Error {
  constructor(readonly code: 'RUNTIME_TIMEOUT' | 'RUNTIME_ERROR', message: string) { super(message); }
}
