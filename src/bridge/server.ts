import { WebSocket, WebSocketServer } from 'ws';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { defaultBridgeOrigins, hasBridgeAccess, loadOrCreateBridgeToken } from './access';
import { bridgeCloseCodes, bridgeError, errorResponse, parseBridgeMessage } from './protocol';
import type { BridgeError, BridgeHello, BridgeRequest, BridgeResponse, RuntimeControl, RuntimeIdentity, RuntimePresence } from './protocol';

export interface BridgeServerOptions {
  port?: number;
  requestTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  token?: string;
  allowedOrigins?: readonly string[];
  log?: (message: string) => void;
  acceptRuntime?: (identity: RuntimeIdentity | undefined) => boolean;
  onRuntimeChange?: (presence: RuntimePresence | undefined) => void;
}

type ClientRole = 'runtime' | 'client' | undefined;
type PendingRequest = { client: WebSocket; runtime: WebSocket; timer: ReturnType<typeof setTimeout> };

/** Local relay between one browser game runtime and one or more Node clients. */
export class RuntimeBridgeServer {
  private readonly server: WebSocketServer;
  private readonly httpServer = createServer((_request, response) => { response.writeHead(404).end(); });
  private readonly connections = new Set<Socket>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly roles = new Map<WebSocket, ClientRole>();
  private runtime: WebSocket | undefined;
  private presence?: RuntimePresence;
  private readonly requestTimeoutMs: number;
  private readonly log: (message: string) => void;
  private readonly shutdownTimeoutMs: number;
  private closing = false;
  private closePromise?: Promise<void>;
  readonly ready: Promise<void>;

  constructor(private readonly options: BridgeServerOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.log = options.log ?? console.info;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 1_000;
    const token = options.token ?? loadOrCreateBridgeToken();
    if (!token) throw new Error('A non-empty bridge token is required.');
    const origins = new Set(options.allowedOrigins ?? defaultBridgeOrigins);
    this.server = new WebSocketServer({
      server: this.httpServer,
      perMessageDeflate: false, maxPayload: 64 * 1024,
      verifyClient: ({ origin, req }, done) => {
        const authorized = !this.closing && hasBridgeAccess(req.headers.authorization, token);
        const allowedOrigin = origin === undefined || origins.has(origin);
        done(authorized && allowedOrigin, authorized ? 403 : 401);
      },
    });
    this.ready = new Promise((resolve, reject) => {
      this.server.once('listening', resolve);
      this.server.once('error', reject);
    });
    this.server.on('connection', (socket) => this.attach(socket));
    this.server.on('listening', () => this.log(`Runtime bridge listening on ws://127.0.0.1:${this.port}`));
    this.server.on('error', (error) => this.log(`Runtime bridge error: ${error.message}`));
    this.httpServer.on('connection', (socket) => {
      this.connections.add(socket);
      socket.once('close', () => this.connections.delete(socket));
    });
    this.httpServer.listen(options.port ?? 8787, '127.0.0.1');
  }

  get port(): number {
    const address = this.server.address();
    return typeof address === 'object' && address ? address.port : 0;
  }

  get runtimeStatus(): RuntimePresence | undefined {
    return this.presence ? { ...this.presence } : undefined;
  }

  controlRuntime(control: RuntimeControl): boolean {
    if (!this.runtime || this.runtime.readyState !== WebSocket.OPEN) return false;
    this.failPending('The game is reloading or stopping.');
    if (this.presence) {
      this.presence = { ...this.presence, state: 'initializing' };
      this.options.onRuntimeChange?.(this.runtimeStatus);
    }
    this.send(this.runtime, control);
    return true;
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.failPending('Runtime bridge server closed.');
    this.closePromise = this.ready.then(() => new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => {
        for (const socket of this.server.clients) socket.terminate();
        for (const socket of this.connections) socket.destroy();
      }, this.shutdownTimeoutMs);
      const closeWebSockets = new Promise<void>((done, fail) => this.server.close((error) => error ? fail(error) : done()));
      const closeHttp = new Promise<void>((done, fail) => this.httpServer.close((error) => error ? fail(error) : done()));
      void Promise.all([closeWebSockets, closeHttp]).then(() => {
        clearTimeout(deadline);
        resolve();
      }, (error: unknown) => {
        clearTimeout(deadline);
        reject(error);
      });
      for (const socket of this.server.clients) socket.close(1001, 'Runtime bridge server closed.');
    }), () => undefined);
    return this.closePromise;
  }

  private attach(socket: WebSocket): void {
    if (this.closing) { socket.close(1001); return; }
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
    if (message.kind === 'hello') return this.registerRole(socket, message);
    if (message.kind === 'request') return this.forwardRequest(socket, message);
    if (message.kind === 'response') return this.forwardResponse(socket, message);
    if (message.kind === 'runtimeStatus' && socket === this.runtime && this.presence) {
      this.presence = { ...this.presence, state: message.state, message: message.message };
      this.options.onRuntimeChange?.(this.runtimeStatus);
    }
  }

  private registerRole(socket: WebSocket, hello: BridgeHello): void {
    if (this.roles.get(socket)) return this.reject(socket, '', bridgeError('MALFORMED_MESSAGE', 'Client role is already registered.'));
    const { role } = hello;
    if (role === 'runtime') {
      if (this.options.acceptRuntime && !this.options.acceptRuntime(hello.identity)) {
        socket.close(bridgeCloseCodes.sessionRejected, 'This runtime session is no longer selected.');
        return;
      }
      if (this.runtime && this.runtime !== socket) {
        this.failPending('Browser game runtime was replaced.');
        this.runtime.close(bridgeCloseCodes.runtimeReplaced, 'Replaced by a new runtime connection.');
      }
      this.runtime = socket;
      this.presence = hello.identity ? { ...hello.identity, state: 'initializing' } : undefined;
      this.options.onRuntimeChange?.(this.runtimeStatus);
      this.log('Game runtime connected.');
    }
    this.roles.set(socket, role);
  }

  private forwardRequest(client: WebSocket, request: BridgeRequest): void {
    if (this.closing) return;
    if (this.roles.get(client) !== 'client') return this.reject(client, request.requestId, bridgeError('MALFORMED_MESSAGE', 'Send a client hello before requests.'));
    if (!this.runtime || this.runtime.readyState !== WebSocket.OPEN) {
      return this.reject(client, request.requestId, bridgeError('RUNTIME_UNAVAILABLE', 'No browser game runtime is connected.'));
    }
    if (this.presence && this.presence.state !== 'ready') {
      return this.reject(client, request.requestId, bridgeError('RUNTIME_NOT_READY', this.presence.message ?? 'The game has not finished initializing.'));
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
    this.pending.set(request.requestId, { client, runtime: this.runtime, timer });
    this.send(this.runtime, request);
  }

  private forwardResponse(socket: WebSocket, response: BridgeResponse): void {
    if (this.runtime !== socket) return;
    const pending = this.pending.get(response.requestId);
    if (!pending || pending.runtime !== socket) return;
    this.pending.delete(response.requestId);
    clearTimeout(pending.timer);
    this.send(pending.client, response);
  }

  private handleClose(socket: WebSocket): void {
    const role = this.roles.get(socket);
    this.roles.delete(socket);
    if (role === 'runtime' && this.runtime === socket) {
      this.runtime = undefined;
      this.presence = undefined;
      this.options.onRuntimeChange?.(undefined);
      this.log('Game runtime disconnected.');
      this.failPending('Browser game runtime disconnected.');
    }
    for (const [id, pending] of this.pending) {
      if (pending.client !== socket) continue;
      clearTimeout(pending.timer);
      this.pending.delete(id);
    }
  }

  private failPending(message: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.send(pending.client, errorResponse(id, bridgeError('RUNTIME_DISCONNECTED', message)));
    }
    this.pending.clear();
  }

  private reject(socket: WebSocket, requestId: string, error: BridgeError): void {
    this.send(socket, errorResponse(requestId, error));
  }

  private send(socket: WebSocket, message: BridgeRequest | BridgeResponse | RuntimeControl): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = readPositiveInteger(process.env.BRIDGE_PORT) ?? 8787;
  const requestTimeoutMs = readPositiveInteger(process.env.BRIDGE_REQUEST_TIMEOUT_MS) ?? 5_000;
  const server = new RuntimeBridgeServer({
    port, requestTimeoutMs,
    allowedOrigins: process.env.BRIDGE_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()),
  });
  void server.ready.catch(() => { process.exitCode = 1; });
  const shutdown = () => { void server.close().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  }); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

function readPositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
