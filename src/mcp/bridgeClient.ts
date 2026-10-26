import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { parseBridgeMessage } from '../bridge/protocol';
import type { BridgeError, BridgeOperation, BridgeResponse } from '../bridge/protocol';
import type { ApiError } from '../runtime';

export interface GameBridgeClientOptions {
  url?: string;
  requestTimeoutMs?: number;
  WebSocketConstructor?: typeof WebSocket;
}

type ClientError = BridgeError | ApiError['error'] | { code: 'BRIDGE_CONNECTION_FAILED'; message: string };

export type GameBridgeResult =
  | { ok: true; result: unknown }
  | { ok: false; error: ClientError };

type PendingRequest = {
  resolve: (result: GameBridgeResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** MCP-facing WebSocket client. It speaks only the existing runtime bridge protocol. */
export class GameBridgeClient {
  private socket: WebSocket | undefined;
  private connecting: Promise<void> | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly url: string;
  private readonly requestTimeoutMs: number;
  private readonly WebSocketConstructor: typeof WebSocket;

  constructor(options: GameBridgeClientOptions = {}) {
    this.url = options.url ?? process.env.MCP_BRIDGE_URL ?? 'ws://127.0.0.1:8787';
    this.requestTimeoutMs = options.requestTimeoutMs ?? readPositiveInteger(process.env.MCP_BRIDGE_TIMEOUT_MS) ?? 5_000;
    this.WebSocketConstructor = options.WebSocketConstructor ?? WebSocket;
  }

  async request(operation: BridgeOperation, args: Record<string, unknown>): Promise<GameBridgeResult> {
    try {
      await this.ensureConnected();
    } catch (cause) {
      return { ok: false, error: connectionError(cause) };
    }

    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return { ok: false, error: { code: 'BRIDGE_CONNECTION_FAILED', message: 'Unable to connect to the game bridge.' } };
    }

    const requestId = randomUUID();
    return new Promise<GameBridgeResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ ok: false, error: { code: 'REQUEST_TIMEOUT', message: `MCP request timed out after ${this.requestTimeoutMs}ms.` } });
      }, this.requestTimeoutMs);
      this.pending.set(requestId, { resolve, timer });
      socket.send(JSON.stringify({ kind: 'request', requestId, operation, args }), (error) => {
        if (!error) return;
        const pending = this.pending.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        pending.resolve({ ok: false, error: connectionError(error) });
      });
    });
  }

  async close(): Promise<void> {
    this.rejectPending({ code: 'BRIDGE_CONNECTION_FAILED', message: 'MCP bridge client closed.' });
    if (!this.socket || this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.socket?.once('close', () => resolve());
      this.socket?.close();
    });
  }

  private ensureConnected(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve, reject) => {
      const socket = new this.WebSocketConstructor(this.url);
      this.socket = socket;
      socket.once('open', () => {
        socket.send(JSON.stringify({ kind: 'hello', role: 'client' }));
        this.connecting = undefined;
        resolve();
      });
      socket.once('error', (error) => {
        this.connecting = undefined;
        reject(error);
      });
      socket.on('message', (data) => this.handleMessage(data.toString()));
      socket.on('close', () => {
        if (this.socket === socket) this.socket = undefined;
        this.connecting = undefined;
        this.rejectPending({ code: 'RUNTIME_DISCONNECTED', message: 'The game bridge connection closed.' });
      });
      socket.on('error', () => undefined);
    });
    return this.connecting;
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
    clearTimeout(pending.timer);
    this.pending.delete(response.requestId);
    pending.resolve(response.ok
      ? { ok: true, result: response.result }
      : { ok: false, error: response.error ?? { code: 'MALFORMED_MESSAGE', message: 'Bridge returned an invalid error response.' } });
  }

  private rejectPending(error: ClientError): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, error });
    }
    this.pending.clear();
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
