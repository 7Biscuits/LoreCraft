import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBridgeMessage } from './protocol';

test('validates structured requests and rejects unsupported operations', () => {
  assert.deepEqual(parseBridgeMessage({
    kind: 'request', requestId: 'request-1', operation: 'getGameState', args: {},
  }), {
    kind: 'request', requestId: 'request-1', operation: 'getGameState', args: {},
  });

  const unsupported = parseBridgeMessage({
    kind: 'request', requestId: 'request-2', operation: 'runAnything', args: {},
  });
  assert.deepEqual(unsupported, {
    code: 'UNSUPPORTED_OPERATION',
    message: 'Unsupported operation "runAnything".',
  });

  const malformed = parseBridgeMessage({ kind: 'request', requestId: '', operation: 'getGameState', args: {} });
  assert.equal('code' in malformed && malformed.code, 'MALFORMED_MESSAGE');

  const missingArguments = parseBridgeMessage({ kind: 'request', requestId: 'request-3', operation: 'setEntityProperties', args: { id: 'player-1' } });
  assert.deepEqual(missingArguments, {
    code: 'MALFORMED_MESSAGE',
    message: 'request.args is missing required fields for setEntityProperties.',
  });
});

test('validates lifecycle identity, status, and control messages', () => {
  const identity = { sessionId: 'session-1', runtimeId: 'document-1', gameId: 'maze-escape' };
  assert.deepEqual(parseBridgeMessage({ kind: 'hello', role: 'runtime', identity }), { kind: 'hello', role: 'runtime', identity });
  for (const message of [
    { kind: 'hello', role: 'runtime', identity: { ...identity, runtimeId: '' } },
    { kind: 'runtimeStatus', state: 'unknown' },
    { kind: 'runtimeStatus', state: 'error', message: 'x'.repeat(4001) },
    { kind: 'control', action: 'execute', url: '/' },
    { kind: 'control', action: 'navigate' },
  ]) {
    const result = parseBridgeMessage(message);
    assert.equal('code' in result && result.code, 'MALFORMED_MESSAGE');
  }
});
test('rejects malformed response envelopes rather than accepting unstructured errors', () => {
  assert.equal('code' in parseBridgeMessage({ kind: 'response', requestId: 'a', ok: false, error: { unexpected: true } }), true);
  assert.equal('code' in parseBridgeMessage({ kind: 'response', requestId: 'a', ok: true }), true);
  assert.equal('code' in parseBridgeMessage({ kind: 'response', requestId: 'a', ok: false, error: { code: 'OPERATION_FAILED', message: 'failed' } }), false);
});
