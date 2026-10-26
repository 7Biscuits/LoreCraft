import { spawn } from 'node:child_process';

/** Fixed build command only. No caller-supplied executable, arguments, or working directory. */
export function validateSource(root: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['build'], {
      cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32', shell: false,
    });
    let output = '';
    let failure: Error | undefined;
    let forceKill: ReturnType<typeof setTimeout> | undefined;
    const capture = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-12000); };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    };
    const cancel = (message: string) => {
      failure = new Error(message);
      kill('SIGTERM');
      forceKill ??= setTimeout(() => kill('SIGKILL'), 500);
    };
    const abort = () => cancel('Build cancelled because the runtime is stopping.');
    const timeout = setTimeout(() => cancel('Source validation exceeded 60 seconds.'), 60000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const cleanup = () => {
      clearTimeout(timeout); clearTimeout(forceKill); signal.removeEventListener('abort', abort);
    };
    child.once('error', (error) => { cleanup(); reject(error); });
    child.once('close', (code) => {
      cleanup();
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Source validation failed (exit ${code}):\n${output}`));
      else resolve();
    });
  });
}

/** Open only the lifecycle manager's loopback URL, using platform-native browser discovery. */
export function openBrowser(url: string): Promise<void> {
  const target = new URL(url);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') throw new Error('Expected a local Vite URL.');
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: 'ignore' });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Browser opener timed out.')); }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(); else reject(new Error(`Browser opener exited ${code}. Open the launch URL manually.`));
    });
  });
}
