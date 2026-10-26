import { bridgeCloseCodes, dispatchRuntimeOperation, isBridgeError, parseBridgeMessage, resultResponse } from './protocol';
import type { BridgeMessage, BridgeResponse, RuntimeOperations } from './protocol';

export interface BrowserBridgeOptions {
  url: string;
  reconnectDelayMs?: number;
  WebSocketConstructor?: typeof WebSocket;
  onStatus?: (message: string) => void;
}

/** Browser-side bridge. It delegates only to GameRuntime and never touches LittleJS directly. */
export class BrowserRuntimeBridge {
  private socket: WebSocket | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private lastStatus = '';
  private readonly WebSocketConstructor: typeof WebSocket;
  private readonly reconnectDelayMs: number;

  constructor(
    private readonly runtime: RuntimeOperations,
    private readonly options: BrowserBridgeOptions,
  ) {
    this.WebSocketConstructor = options.WebSocketConstructor ?? WebSocket;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1_000;
  }

  connect(): void {
    this.stopped = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.open();
  }

  private open(): void {
    if (this.stopped || this.socket?.readyState === this.WebSocketConstructor.OPEN || this.socket?.readyState === this.WebSocketConstructor.CONNECTING) return;
    const socket = new this.WebSocketConstructor(this.options.url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.stopped || this.socket !== socket) { socket.close(); return; }
      this.send({ kind: 'hello', role: 'runtime' });
      this.reportStatus('Runtime bridge connected.');
    });
    socket.addEventListener('message', (event) => {
      if (this.socket === socket && !this.stopped) this.handleMessage(event.data);
    });
    socket.addEventListener('close', (event) => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      if (event.code === bridgeCloseCodes.runtimeReplaced) {
        this.stopped = true;
        this.reportStatus('Runtime bridge replaced by another game tab.');
        return;
      }
      if (!this.stopped) {
        this.reportStatus('Runtime bridge disconnected; reconnecting.');
        this.reconnectTimer = setTimeout(() => this.open(), this.reconnectDelayMs);
      }
    });
    socket.addEventListener('error', () => this.reportStatus('Runtime bridge socket error.'));
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  private handleMessage(raw: unknown): void {
    const parsed = parseJsonMessage(raw);
    if (!parsed || isBridgeError(parsed) || parsed.kind !== 'request') return;
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
