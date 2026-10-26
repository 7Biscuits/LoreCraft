import type { GameRuntime } from '../runtime';
import { dispatchRuntimeOperation, isBridgeError, parseBridgeMessage, resultResponse } from './protocol';
import type { BridgeMessage, BridgeResponse } from './protocol';

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
    private readonly runtime: GameRuntime,
    private readonly options: BrowserBridgeOptions,
  ) {
    this.WebSocketConstructor = options.WebSocketConstructor ?? WebSocket;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1_000;
  }

  connect(): void {
    if (this.stopped || this.socket?.readyState === this.WebSocketConstructor.OPEN || this.socket?.readyState === this.WebSocketConstructor.CONNECTING) return;
    const socket = new this.WebSocketConstructor(this.options.url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.send({ kind: 'hello', role: 'runtime' });
      this.reportStatus('Runtime bridge connected.');
    });
    socket.addEventListener('message', (event) => this.handleMessage(event.data));
    socket.addEventListener('close', () => {
      if (!this.stopped) {
        this.reportStatus('Runtime bridge disconnected; reconnecting.');
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelayMs);
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
    const result = dispatchRuntimeOperation(parsed.operation, parsed.args, this.runtime);
    this.send(resultResponse(parsed.requestId, result));
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
