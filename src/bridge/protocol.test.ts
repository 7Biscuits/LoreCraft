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
