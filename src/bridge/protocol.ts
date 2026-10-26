import type { ApiError, ApiResult, CreateEntityArgs, EntityPosition, EntityProperties } from '../runtime';

export const bridgeOperations = [
  'createEntity',
  'getEntity',
  'listEntities',
  'setEntityPosition',
  'setEntityProperties',
  'deleteEntity',
  'getGameState',
  'resetGame',
] as const;

export type BridgeOperation = typeof bridgeOperations[number];
export type BridgeRole = 'runtime' | 'client';

export const bridgeCloseCodes = { runtimeReplaced: 4000, sessionRejected: 4001 } as const;

export interface RuntimeIdentity {
  sessionId: string;
  runtimeId: string;
  gameId: string;
}

export interface RuntimeStatus {
  kind: 'runtimeStatus';
  state: 'initializing' | 'ready' | 'error';
  message?: string;
}

export interface RuntimePresence extends RuntimeIdentity {
  state: RuntimeStatus['state'];
  message?: string;
}

/** Sent only by the Node lifecycle owner, never forwarded from ordinary clients. */
export interface RuntimeControl {
  kind: 'control';
  action: 'navigate' | 'stop';
  url?: string;
}

export interface BridgeHello {
  kind: 'hello';
  role: BridgeRole;
  identity?: RuntimeIdentity;
}

export interface BridgeRequest {
  kind: 'request';
  requestId: string;
  operation: BridgeOperation;
  args: Record<string, unknown>;
}

export interface BridgeResponse {
  kind: 'response';
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: ApiError['error'] | BridgeError;
}

export interface BridgeError {
  code: 'MALFORMED_MESSAGE' | 'UNSUPPORTED_OPERATION' | 'RUNTIME_UNAVAILABLE' | 'REQUEST_TIMEOUT' | 'RUNTIME_DISCONNECTED' | 'DUPLICATE_REQUEST_ID' | 'RUNTIME_NOT_READY';
  message: string;
}

export type BridgeMessage = BridgeHello | BridgeRequest | BridgeResponse | RuntimeStatus | RuntimeControl;

export type BridgeApiResult = ApiResult<unknown>;

export function parseBridgeMessage(raw: unknown): BridgeMessage | BridgeError {
  if (!isObject(raw) || typeof raw.kind !== 'string') {
    return bridgeError('MALFORMED_MESSAGE', 'Message must be an object with a supported kind.');
  }
  if (raw.kind === 'hello') {
    const identity = raw.identity;
    if (identity !== undefined && (!isObject(identity) || !['sessionId', 'runtimeId', 'gameId'].every((key) => isRequestId(identity[key])))) {
      return bridgeError('MALFORMED_MESSAGE', 'Runtime identity needs sessionId, runtimeId, and gameId strings.');
    }
    return raw.role === 'runtime' || raw.role === 'client'
      ? { kind: 'hello', role: raw.role, ...(identity ? { identity: identity as unknown as RuntimeIdentity } : {}) }
      : bridgeError('MALFORMED_MESSAGE', 'hello.role must be "runtime" or "client".');
  }
  if (raw.kind === 'runtimeStatus') {
    if (typeof raw.state !== 'string' || !['initializing', 'ready', 'error'].includes(raw.state) || (raw.message !== undefined && (typeof raw.message !== 'string' || raw.message.length > 4000))) {
      return bridgeError('MALFORMED_MESSAGE', 'Invalid runtime status.');
    }
    return { kind: 'runtimeStatus', state: raw.state as RuntimeStatus['state'], message: raw.message as string | undefined };
  }
  if (raw.kind === 'control') {
    if ((raw.action !== 'navigate' && raw.action !== 'stop') || (raw.action === 'navigate' && (typeof raw.url !== 'string' || raw.url.length > 2048))) {
      return bridgeError('MALFORMED_MESSAGE', 'Invalid runtime control.');
    }
    return { kind: 'control', action: raw.action, url: raw.url as string | undefined };
  }
  if (raw.kind === 'request') {
    if (!isRequestId(raw.requestId)) return bridgeError('MALFORMED_MESSAGE', 'request.requestId must be a non-empty string.');
    if (!isOperation(raw.operation)) return bridgeError('UNSUPPORTED_OPERATION', `Unsupported operation "${String(raw.operation)}".`);
    if (!isObject(raw.args)) return bridgeError('MALFORMED_MESSAGE', 'request.args must be an object.');
    if (!hasRequiredArguments(raw.operation, raw.args)) {
      return bridgeError('MALFORMED_MESSAGE', `request.args is missing required fields for ${raw.operation}.`);
    }
    return { kind: 'request', requestId: raw.requestId, operation: raw.operation, args: raw.args };
  }
  if (raw.kind === 'response') {
    if (!isRequestId(raw.requestId) || typeof raw.ok !== 'boolean') {
      return bridgeError('MALFORMED_MESSAGE', 'response must include a non-empty requestId and boolean ok.');
    }
    return { kind: 'response', requestId: raw.requestId, ok: raw.ok, result: raw.result, error: isObject(raw.error) ? raw.error as unknown as BridgeError : undefined };
  }
  return bridgeError('MALFORMED_MESSAGE', `Unsupported message kind "${raw.kind}".`);
}

export function bridgeError(code: BridgeError['code'], message: string): BridgeError {
  return { code, message };
}

export function isBridgeError(message: BridgeMessage | BridgeError): message is BridgeError {
  return 'code' in message;
}

export function errorResponse(requestId: string, error: BridgeError | ApiError['error']): BridgeResponse {
  return { kind: 'response', requestId, ok: false, error };
}

export function resultResponse(requestId: string, result: BridgeApiResult): BridgeResponse {
  return result.ok
    ? { kind: 'response', requestId, ok: true, result: result.data }
    : { kind: 'response', requestId, ok: false, error: result.error };
}

export function dispatchRuntimeOperation(operation: BridgeOperation, args: Record<string, unknown>, runtime: RuntimeOperations): BridgeApiResult {
  switch (operation) {
    case 'createEntity': return runtime.createEntity(args as unknown as CreateEntityArgs);
    case 'getEntity': return runtime.getEntity(args.id as string);
    case 'listEntities': return runtime.listEntities();
    case 'setEntityPosition': return runtime.setEntityPosition(args.id as string, args.position as EntityPosition);
    case 'setEntityProperties': return runtime.setEntityProperties(args.id as string, args.properties as EntityProperties);
    case 'deleteEntity': return runtime.deleteEntity(args.id as string);
    case 'getGameState': return runtime.getGameState();
    case 'resetGame': return runtime.resetGame();
  }
}

export interface RuntimeOperations {
  createEntity(args: CreateEntityArgs): BridgeApiResult;
  getEntity(id: string): BridgeApiResult;
  listEntities(): BridgeApiResult;
  setEntityPosition(id: string, position: EntityPosition): BridgeApiResult;
  setEntityProperties(id: string, properties: EntityProperties): BridgeApiResult;
  deleteEntity(id: string): BridgeApiResult;
  getGameState(): BridgeApiResult;
  resetGame(): BridgeApiResult;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function isOperation(value: unknown): value is BridgeOperation {
  return typeof value === 'string' && (bridgeOperations as readonly string[]).includes(value);
}

function hasRequiredArguments(operation: BridgeOperation, args: Record<string, unknown>): boolean {
  switch (operation) {
    case 'createEntity': return ['id', 'type', 'dimension', 'position'].every((key) => key in args);
    case 'getEntity':
    case 'deleteEntity': return 'id' in args;
    case 'setEntityPosition': return 'id' in args && 'position' in args;
    case 'setEntityProperties': return 'id' in args && 'properties' in args;
    case 'listEntities':
    case 'getGameState':
    case 'resetGame': return true;
  }
}
