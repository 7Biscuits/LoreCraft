import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const checkout = fileURLToPath(new URL('../../', import.meta.url));
const tokenPath = join(homedir(), '.local', 'share', 'lorecraft', createHash('sha256').update(checkout).digest('hex').slice(0, 16), 'bridge-token');

/** Only Node processes read this file. The browser connects through Vite's proxy. */
export function readBridgeToken(path = process.env.LORECRAFT_BRIDGE_TOKEN_FILE ?? tokenPath): string {
  const token = readFileSync(path, 'utf8').trim();
  if (!token) throw new Error('The bridge token is empty. Start pnpm bridge to initialize local access.');
  return token;
}

export function loadOrCreateBridgeToken(path = process.env.LORECRAFT_BRIDGE_TOKEN_FILE ?? tokenPath): string {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  return readBridgeToken(path);
}

export function hasBridgeAccess(authorization: string | undefined, token: string): boolean {
  const actual = Buffer.from(authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const defaultBridgeOrigins = [
  'http://127.0.0.1:5173', 'http://localhost:5173',
  'http://127.0.0.1:4173', 'http://localhost:4173',
];
