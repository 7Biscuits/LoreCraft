import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSource } from './processes';

test('cancelling source validation stops its owned build process group', { timeout: 5000, skip: process.platform === 'win32' }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lorecraft-build-'));
  const pidsPath = join(directory, 'pids.json');
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ scripts: { build: 'node build.cjs' } }));
  writeFileSync(join(directory, 'build.cjs'), `
    const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    require('node:fs').writeFileSync('pids.json', JSON.stringify([process.pid, child.pid]));
    setInterval(() => {}, 1000);
  `);
  const cancellation = new AbortController();
  const build = validateSource(directory, cancellation.signal);
  // Install a rejection handler immediately, including if the build executable cannot start.
  const rejected = assert.rejects(build, /cancelled/);
  let pids: number[] = [];
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  try {
    for (let attempt = 0; attempt < 100 && !existsSync(pidsPath); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(existsSync(pidsPath), 'Build fixture did not start.');
    pids = JSON.parse(readFileSync(pidsPath, 'utf8')) as number[];
    cancellation.abort();
    await rejected;
    for (let attempt = 0; attempt < 50 && pids.some(alive); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(pids.some(alive), false, 'A build descendant survived cancellation.');
  } finally {
    cancellation.abort(); await build.catch(() => undefined);
    for (const pid of pids) if (alive(pid)) process.kill(pid, 'SIGKILL');
    rmSync(directory, { recursive: true });
  }
});
