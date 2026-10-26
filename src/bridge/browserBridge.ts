import { bridgeCloseCodes, dispatchRuntimeOperation, isBridgeError, parseBridgeMessage, resultResponse } from './protocol';
import type { BridgeMessage, BridgeResponse, RuntimeControl, RuntimeIdentity, RuntimeOperations, RuntimeStatus } from './protocol';

export interface BrowserBridgeOptions {
  url: string;
  reconnectDelayMs?: number;
  checkAvailability?: () => Promise<boolean>;
  WebSocketConstructor?: typeof WebSocket;
  onStatus?: (message: string) => void;
  identity?: RuntimeIdentity;
  onControl?: (control: RuntimeControl) => void;
  beforeControl?: () => void;
  onReplaced?: () => void;
}

/** Browser-side bridge. It delegates only to GameRuntime and never touches LittleJS directly. */
export class BrowserRuntimeBridge {
  private socket: WebSocket | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private attempt = 0;
  private lastStatus = '';
  private readonly WebSocketConstructor: typeof WebSocket;
  private readonly reconnectDelayMs: number;
  private status: RuntimeStatus = { kind: 'runtimeStatus', state: 'initializing' };

  constructor(
    private runtime: RuntimeOperations | undefined,
    private readonly options: BrowserBridgeOptions,
  ) {
    this.WebSocketConstructor = options.WebSocketConstructor ?? WebSocket;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1_000;
  }

  connect(): void {
    this.stopped = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    void this.open();
  }

  private async open(): Promise<void> {
    if (this.stopped || this.socket?.readyState === this.WebSocketConstructor.OPEN || this.socket?.readyState === this.WebSocketConstructor.CONNECTING) return;
    const attempt = ++this.attempt;
    if (this.options.checkAvailability) {
      let available = false;
      try { available = await this.options.checkAvailability(); } catch { /* Relay is optional. */ }
      if (this.stopped || attempt !== this.attempt) return;
      if (!available) {
        this.reportStatus('MCP relay offline; gameplay remains available.');
        this.reconnectTimer = setTimeout(() => { void this.open(); }, this.reconnectDelayMs);
        return;
      }
    }
    const socket = new this.WebSocketConstructor(this.options.url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.stopped || this.socket !== socket) { socket.close(); return; }
      this.send({ kind: 'hello', role: 'runtime', ...(this.options.identity ? { identity: this.options.identity } : {}) });
      if (this.options.identity) this.send(this.status);
      this.reportStatus('Runtime bridge connected.');
    });
    socket.addEventListener('message', (event) => {
      if (this.socket === socket && !this.stopped) this.handleMessage(event.data);
    });
    socket.addEventListener('close', (event) => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      if (event.code === bridgeCloseCodes.runtimeReplaced || event.code === bridgeCloseCodes.sessionRejected) {
        this.stopped = true;
        this.options.onReplaced?.();
        this.reportStatus(event.code === bridgeCloseCodes.sessionRejected ? 'Runtime session is no longer selected.' : 'Runtime bridge replaced by another game tab.');
        return;
      }
      if (!this.stopped) {
        this.reportStatus('Runtime bridge disconnected; reconnecting.');
        this.reconnectTimer = setTimeout(() => { void this.open(); }, this.reconnectDelayMs);
      }
    });
    socket.addEventListener('error', () => this.reportStatus('Runtime bridge socket error.'));
  }

  disconnect(): void {
    this.stopped = true;
    ++this.attempt;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  setRuntime(runtime: RuntimeOperations): void {
    this.runtime = runtime;
    this.setRuntimeStatus('ready');
  }

  setRuntimeStatus(state: RuntimeStatus['state'], message?: string): void {
    this.status = { kind: 'runtimeStatus', state, message: message?.slice(0, 4000) };
    this.send(this.status);
  }

  private handleMessage(raw: unknown): void {
    const parsed = parseJsonMessage(raw);
    if (!parsed || isBridgeError(parsed)) return;
    if (parsed.kind === 'control') {
      // Stop gameplay first, acknowledge disposal, then let the page navigate.
      this.options.beforeControl?.();
      if (parsed.controlId) this.send({ kind: 'controlAck', controlId: parsed.controlId });
      this.options.onControl?.(parsed); return;
    }
    if (parsed.kind !== 'request') return;
    if (!this.runtime || (this.options.identity && this.status.state !== 'ready')) {
      this.send(resultResponse(parsed.requestId, { ok: false, error: { code: 'OPERATION_FAILED', message: this.status.message ?? 'Runtime is not ready.' } }));
      return;
    }
    try {
      const result = dispatchRuntimeOperation(parsed.operation, parsed.args, this.runtime);
      this.send(resultResponse(parsed.requestId, result));
    } catch (cause) {
      this.send(resultResponse(parsed.requestId, {
        ok: false, error: { code: 'OPERATION_FAILED', message: cause instanceof Error ? cause.message : 'Runtime operation failed.' },
      }));
    }
  }

  private send(message: BridgeMessage | BridgeResponse): void {
    if (this.socket?.readyState === this.WebSocketConstructor.OPEN) this.socket.send(JSON.stringify(message));
  }

  private reportStatus(message: string): void {
    if (message === this.lastStatus) return;
    this.lastStatus = message;
    this.options.onStatus?.(message);
  }
}

function parseJsonMessage(raw: unknown): ReturnType<typeof parseBridgeMessage> | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    return parseBridgeMessage(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/** Ask the same-origin Node endpoint; relay credentials stay out of the browser. */
export async function isRuntimeBridgeAvailable(): Promise<boolean> {
  try {
    const response = await fetch('/api/agent-status', { cache: 'no-store', signal: AbortSignal.timeout(1800) });
    return response.ok && (await response.json()).connected === true;
  } catch { return false; }
}
