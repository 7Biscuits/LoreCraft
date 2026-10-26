import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { readBridgeToken } from '../bridge/access';
import { parseBridgeMessage } from '../bridge/protocol';
import type { BridgeError, BridgeOperation, BridgeResponse } from '../bridge/protocol';
import type { ApiError } from '../runtime';

export interface GameBridgeClientOptions {
  url?: string;
  requestTimeoutMs?: number;
  token?: string;
  WebSocketConstructor?: typeof WebSocket;
}

type ClientError = BridgeError | ApiError['error'] | { code: 'BRIDGE_CONNECTION_FAILED'; message: string };

export type GameBridgeResult =
  | { ok: true; result: unknown }
  | { ok: false; error: ClientError };

type PendingRequest = {
  resolve: (result: GameBridgeResult) => void;
  timer: ReturnType<typeof setTimeout>;
  socket?: WebSocket;
};

/** MCP-facing WebSocket client. It speaks only the existing runtime bridge protocol. */
export class GameBridgeClient {
  private socket: WebSocket | undefined;
  private connecting: Promise<WebSocket> | undefined;
  private closed = false;
  private closePromise?: Promise<void>;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly url: string;
  private readonly requestTimeoutMs: number;
  private readonly WebSocketConstructor: typeof WebSocket;
  private readonly token: string | undefined;

  constructor(options: GameBridgeClientOptions = {}) {
    this.url = options.url ?? process.env.MCP_BRIDGE_URL ?? 'ws://127.0.0.1:8787';
    this.requestTimeoutMs = options.requestTimeoutMs ?? readPositiveInteger(process.env.MCP_BRIDGE_TIMEOUT_MS) ?? 5_000;
    this.WebSocketConstructor = options.WebSocketConstructor ?? WebSocket;
    this.token = options.token;
  }

  request(operation: BridgeOperation, args: Record<string, unknown>): Promise<GameBridgeResult> {
    if (this.closed) return Promise.resolve({ ok: false, error: connectionError(new Error('Client is closed.')) });
    const requestId = randomUUID();
    return new Promise<GameBridgeResult>((resolve) => {
      const timer = setTimeout(() => {
        this.finish(requestId, { ok: false, error: { code: 'REQUEST_TIMEOUT', message: `MCP request timed out after ${this.requestTimeoutMs}ms.` } });
      }, this.requestTimeoutMs);
      this.pending.set(requestId, { resolve, timer });
      void this.ensureConnected().then((socket) => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        pending.socket = socket;
        socket.send(JSON.stringify({ kind: 'request', requestId, operation, args }), (error) => {
          if (error) this.finish(requestId, { ok: false, error: connectionError(error) });
        });
      }).catch((cause: unknown) => this.finish(requestId, { ok: false, error: connectionError(cause) }));
    });
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.rejectPending({ code: 'BRIDGE_CONNECTION_FAILED', message: 'MCP bridge client closed.' });
    const socket = this.socket;
    this.closePromise = new Promise<void>((resolve) => {
      if (!socket || socket.readyState === WebSocket.CLOSED) return resolve();
      socket.once('close', resolve);
      socket.terminate();
    });
    return this.closePromise;
  }

  private async ensureConnected(): Promise<WebSocket> {
    if (this.closed) throw new Error('Client is closed.');
    if (this.socket?.readyState === WebSocket.OPEN) return this.socket;
    if (this.connecting) return this.connecting;

    const connecting = new Promise<WebSocket>((resolve, reject) => {
      const socket = new this.WebSocketConstructor(this.url, {
        headers: { Authorization: `Bearer ${this.token ?? readBridgeToken()}` },
        handshakeTimeout: this.requestTimeoutMs,
      });
      this.socket = socket;
      socket.once('open', () => {
        socket.send(JSON.stringify({ kind: 'hello', role: 'client' }), (error) => error ? reject(error) : resolve(socket));
      });
      socket.on('error', reject);
      socket.on('message', (data) => this.handleMessage(data.toString()));
      socket.on('close', () => {
        reject(new Error('The game bridge connection closed.'));
        if (this.socket === socket) this.socket = undefined;
        this.rejectPending({ code: 'RUNTIME_DISCONNECTED', message: 'The game bridge connection closed.' }, socket);
      });
    });
    this.connecting = connecting;
    try { return await connecting; }
    finally { if (this.connecting === connecting) this.connecting = undefined; }
  }

  private handleMessage(text: string): void {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return; }
    const parsed = parseBridgeMessage(raw);
    if ('code' in parsed || parsed.kind !== 'response') return;
    this.handleResponse(parsed);
  }

  private handleResponse(response: BridgeResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.finish(response.requestId, response.ok
      ? { ok: true, result: response.result }
      : { ok: false, error: response.error ?? { code: 'MALFORMED_MESSAGE', message: 'Bridge returned an invalid error response.' } });
  }

  private finish(id: string, result: GameBridgeResult): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.resolve(result);
  }

  private rejectPending(error: ClientError, socket?: WebSocket): void {
    for (const [id, pending] of this.pending) {
      if (!socket || pending.socket === socket) this.finish(id, { ok: false, error });
    }
  }
}

function connectionError(cause: unknown): { code: 'BRIDGE_CONNECTION_FAILED'; message: string } {
  const detail = cause instanceof Error ? cause.message : 'unknown connection error';
  return { code: 'BRIDGE_CONNECTION_FAILED', message: `Unable to connect to the game bridge: ${detail}` };
}

function readPositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
