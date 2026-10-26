import type { AuthoredGameHost } from '../games/host';
import type { RuntimeOperations } from '../bridge/protocol';
import type { ApiResult } from './types';

export interface RuntimeLog { level: string; message: string; timestamp: string }
export const runtimeLogs: RuntimeLog[] = [];
export function recordLog(level: string, message: string): void { runtimeLogs.push({ level, message: message.slice(0, 2000), timestamp: new Date().toISOString() }); if (runtimeLogs.length > 100) runtimeLogs.shift(); }

export function captureConsole(): () => void {
  const restore: (() => void)[] = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      recordLog(level, args.map((arg) => { try { return arg instanceof Error ? arg.stack ?? arg.message : typeof arg === 'string' ? arg : JSON.stringify(arg); } catch { return String(arg); } }).join(' '));
      original.apply(console, args);
    };
    restore.push(() => { console[level] = original; });
  }
  return () => restore.forEach((fn) => fn());
}

export function inspectionOperations(host: AuthoredGameHost, gameplayTest?: () => unknown): Partial<RuntimeOperations> {
  const pass = (data: unknown): ApiResult<unknown> => ({ ok: true, data });
  const frames = (value: unknown) => { if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 600) throw new Error('frames must be an integer from 1 to 600.'); return Number(value); };
  return {
    pauseGame: () => { host.pause(); return pass({ paused: true }); },
    resumeGame: () => { host.resume(); return pass({ paused: false }); },
    stepGame: (args) => { host.step(frames(args.frames)); return host.runtime.getGameState(); },
    simulateInput: (args) => {
      if (typeof args.x !== 'number' || !Number.isFinite(args.x) || Math.abs(args.x) > 1 || typeof args.y !== 'number' || !Number.isFinite(args.y) || Math.abs(args.y) > 1) throw new Error('Input x and y must be finite values from -1 to 1.');
      const count = frames(args.frames);
      host.setInput({ x: args.x, y: args.y }); try { host.step(count); } finally { host.setInput(undefined); }
      return host.runtime.getGameState();
    },
    captureScreenshot: () => {
      const canvases = [...document.querySelectorAll('canvas')].filter((c) => c.width > 0 && c.height > 0);
      if (!canvases.length) throw new Error('No rendered canvas is available.');
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 560;
      const context = canvas.getContext('2d')!;
      for (const source of canvases) context.drawImage(source, 0, 0, canvas.width, canvas.height);
      return pass({ mimeType: 'image/png', width: canvas.width, height: canvas.height, dataUrl: canvas.toDataURL('image/png') });
    },
    getRuntimeLogs: () => pass({ logs: [...runtimeLogs], paused: host.isPaused }),
    runGameplayTest: () => gameplayTest ? pass(gameplayTest()) : pass({ checks: [{ name: 'Runtime snapshot', passed: host.runtime.getGameState().ok, detail: 'Runtime snapshot is available. Full scenarios are provided for generated games.' }] }),
  };
}
