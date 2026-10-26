import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasBridgeAccess, loadOrCreateBridgeToken, readBridgeToken } from './access';

test('local access tokens persist with private permissions and are checked exactly', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lorecraft-access-'));
  const path = join(directory, 'private', 'token');
  try {
    const token = loadOrCreateBridgeToken(path);
    assert.equal(token.length, 64);
    assert.equal(loadOrCreateBridgeToken(path), token);
    assert.equal(readBridgeToken(path), token);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(hasBridgeAccess(`Bearer ${token}`, token), true);
    assert.equal(hasBridgeAccess(undefined, token), false);
    assert.equal(hasBridgeAccess(`Bearer ${token}extra`, token), false);
    assert.equal(hasBridgeAccess(`Bearer ${'x'.repeat(token.length)}`, token), false);
  } finally { rmSync(directory, { recursive: true }); }
});
