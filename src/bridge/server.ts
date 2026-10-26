import { WebSocket, WebSocketServer } from 'ws';
import { bridgeError, errorResponse, parseBridgeMessage } from './protocol';
import type { BridgeError, BridgeRequest, BridgeResponse } from './protocol';

export interface BridgeServerOptions {
  port?: number;
  requestTimeoutMs?: number;
  log?: (message: string) => void;
}

type ClientRole = 'runtime' | 'client' | undefined;
type PendingRequest = { client: WebSocket; timer: ReturnType<typeof setTimeout> };

/** Local relay between one browser game runtime and one or more Node clients. */
export class RuntimeBridgeServer {
  private readonly server: WebSocketServer;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly roles = new Map<WebSocket, ClientRole>();
  private runtime: WebSocket | undefined;
  private readonly requestTimeoutMs: number;
  private readonly log: (message: string) => void;

  constructor(options: BridgeServerOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.log = options.log ?? console.info;
    this.server = new WebSocketServer({ port: options.port ?? 8787, perMessageDeflate: false });
    this.server.on('connection', (socket) => this.attach(socket));
    this.server.on('listening', () => this.log(`Runtime bridge listening on ws://127.0.0.1:${this.port}`));
  }

  get port(): number {
    const address = this.server.address();
    return typeof address === 'object' && address ? address.port : 0;
  }

  close(): Promise<void> {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.send(pending.client, errorResponse(id, bridgeError('RUNTIME_DISCONNECTED', 'Runtime bridge server closed.')));
    }
    this.pending.clear();
    return new Promise((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
  }

  private attach(socket: WebSocket): void {
    this.roles.set(socket, undefined);
    socket.on('message', (data, isBinary) => {
      if (isBinary) return this.reject(socket, '', bridgeError('MALFORMED_MESSAGE', 'Binary messages are not supported.'));
      this.handleMessage(socket, data.toString());
    });
    socket.on('close', () => this.handleClose(socket));
    socket.on('error', () => this.log('Runtime bridge socket error.'));
  }

  private handleMessage(socket: WebSocket, text: string): void {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch {
      this.reject(socket, '', bridgeError('MALFORMED_MESSAGE', 'Message must be valid JSON.'));
      return;
    }
    const message = parseBridgeMessage(raw);
    if ('code' in message) {
      const requestId = typeof raw === 'object' && raw && 'requestId' in raw && typeof raw.requestId === 'string' ? raw.requestId : '';
      this.reject(socket, requestId, message);
      return;
    }
    if (message.kind === 'hello') return this.registerRole(socket, message.role);
    if (message.kind === 'request') return this.forwardRequest(socket, message);
    this.forwardResponse(socket, message);
  }

  private registerRole(socket: WebSocket, role: ClientRole): void {
    if (this.roles.get(socket)) return this.reject(socket, '', bridgeError('MALFORMED_MESSAGE', 'Client role is already registered.'));
    if (role === 'runtime') {
      if (this.runtime && this.runtime !== socket) this.runtime.close(4000, 'Replaced by a new runtime connection.');
      this.runtime = socket;
      this.log('Game runtime connected.');
    }
    this.roles.set(socket, role);
  }

  private forwardRequest(client: WebSocket, request: BridgeRequest): void {
    if (this.roles.get(client) !== 'client') return this.reject(client, request.requestId, bridgeError('MALFORMED_MESSAGE', 'Send a client hello before requests.'));
    if (!this.runtime || this.runtime.readyState !== WebSocket.OPEN) {
      return this.reject(client, request.requestId, bridgeError('RUNTIME_UNAVAILABLE', 'No browser game runtime is connected.'));
    }
    if (this.pending.has(request.requestId)) {
      return this.reject(client, request.requestId, bridgeError('DUPLICATE_REQUEST_ID', `Request ID "${request.requestId}" is already pending.`));
    }
    const timer = setTimeout(() => {
      const pending = this.pending.get(request.requestId);
      if (!pending) return;
      this.pending.delete(request.requestId);
      this.send(pending.client, errorResponse(request.requestId, bridgeError('REQUEST_TIMEOUT', `Request "${request.requestId}" timed out after ${this.requestTimeoutMs}ms.`)));
    }, this.requestTimeoutMs);
    this.pending.set(request.requestId, { client, timer });
    this.send(this.runtime, request);
  }

  private forwardResponse(socket: WebSocket, response: BridgeResponse): void {
    if (this.roles.get(socket) !== 'runtime') return;
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    clearTimeout(pending.timer);
    this.send(pending.client, response);
  }

  private handleClose(socket: WebSocket): void {
    const role = this.roles.get(socket);
    this.roles.delete(socket);
    if (role === 'runtime' && this.runtime === socket) {
      this.runtime = undefined;
      this.log('Game runtime disconnected.');
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        this.send(pending.client, errorResponse(id, bridgeError('RUNTIME_DISCONNECTED', 'Browser game runtime disconnected.')));
      }
      this.pending.clear();
    }
  }

  private reject(socket: WebSocket, requestId: string, error: BridgeError): void {
    this.send(socket, errorResponse(requestId, error));
  }

  private send(socket: WebSocket, message: BridgeRequest | BridgeResponse): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = readPositiveInteger(process.env.BRIDGE_PORT) ?? 8787;
  const requestTimeoutMs = readPositiveInteger(process.env.BRIDGE_REQUEST_TIMEOUT_MS) ?? 5_000;
  new RuntimeBridgeServer({ port, requestTimeoutMs });
}

function readPositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
