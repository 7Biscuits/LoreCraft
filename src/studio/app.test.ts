import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { startStudio } from './app';
import { readProjects } from './storage';
import { createGameEngine } from './engine';
import type { GameSpec } from './spec';

type Listener = (event: any) => void;

// Exercise the studio's real event handlers and storage without starting a game
// engine. Only the browser surface is stubbed; project/generation logic is real.
async function studioFixture(t: TestContext) {
  const elements = new Map<string, ReturnType<typeof makeElement>>();
  function makeElement() {
    const attributes = new Set<string>();
    return {
      value: '', src: '', innerHTML: '', textContent: '', hidden: false,
      attributes, listeners: new Map<string, Listener>(),
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(name: string) { attributes.add(name); },
      removeAttribute(name: string) { attributes.delete(name); },
      addEventListener(name: string, listener: Listener) { this.listeners.set(name, listener); },
      focus() {}, close() {},
      contentWindow: { postMessage(_message?: unknown, _origin?: string) {}, focus() {} },
    };
  }
  const element = (selector: string) => {
    if (!elements.has(selector)) elements.set(selector, makeElement());
    return elements.get(selector)!;
  };
  const documentListeners = new Map<string, Listener>();
  const windowListeners = new Map<string, Listener>();
  const storage = new Map<string, string>();
  const globals = {
    document: {
      body: makeElement(), querySelector: element, querySelectorAll: () => [],
      addEventListener: (name: string, listener: Listener) => documentListeners.set(name, listener),
    },
    window: { addEventListener: (name: string, listener: Listener) => windowListeners.set(name, listener) },
    location: { origin: 'http://127.0.0.1:5173', pathname: '/' },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
  };
  const originals = Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const nativeTimeout = setTimeout;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  t.mock.method(globalThis, 'setTimeout', (callback: (...args: any[]) => void, delay?: number, ...args: any[]) => {
    const timer = nativeTimeout(callback, delay, ...args); timers.add(timer); return timer;
  });
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  t.after(() => {
    windowListeners.get('pagehide')?.({});
    for (const timer of timers) clearTimeout(timer);
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  await startStudio();
  const send = (type: string, data: unknown, requestId?: string) => windowListeners.get('message')!({
    origin: globals.location.origin, source: element('#game-frame').contentWindow,
    data: { source: 'lorecraft-player', type, data, requestId },
  });
  element('#game-frame').contentWindow.postMessage = (message) => {
    const { requestId } = message as { requestId?: string };
    if (requestId) send('response', { ok: true }, requestId);
  };
  const reportState = (spec: GameSpec) => {
    send('ready', {});
    send('state', { snapshot: createGameEngine(spec).snapshot(), paused: true, entities: { data: [] }, logs: [] });
  };
  const click = async (action: string, data: Record<string, string> = {}) => {
    documentListeners.get('click')!({ target: { closest: () => ({ dataset: { action, ...data } }) } });
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  const generate = async (prompt: string, duringGeneration?: () => Promise<void>) => {
    element('#prompt').value = prompt;
    element('#prompt-form').listeners.get('submit')!({ preventDefault() {} });
    assert.equal(element('#generate').attributes.has('disabled'), true);
    await duringGeneration?.();
    const deadline = Date.now() + 3000;
    while (element('#generate').attributes.has('disabled') && Date.now() < deadline) await new Promise((resolve) => nativeTimeout(resolve, 10));
    assert.equal(element('#generate').attributes.has('disabled'), false, 'Generation must finish');
    assert.match(element('#toast').textContent, /is ready/);
  };
  return { element, click, generate, reportState };
}

test('background refinements survive saves and accumulate without replacing the playing revision', async (t) => {
  const studio = await studioFixture(t);
  const original = readProjects()[0]!;
  const playingUrl = studio.element('#game-frame').src;
  await studio.generate('more enemies');
  assert.equal(studio.element('#game-frame').src, playingUrl);
  await studio.click('save');
  let saved = readProjects()[0]!;
  assert.equal(saved.revisions.length, 2);
  assert.equal(saved.revisions[1]!.spec.enemyCount, original.revisions[0]!.spec.enemyCount + 2);
  assert.equal(saved.activeRevisionId, saved.revisions[1]!.id);
  studio.reportState(original.revisions[0]!.spec);
  await studio.click('checkpoint');
  const checkpoint = JSON.parse(localStorage.getItem(`lorecraft.checkpoint.${original.id}`)!);
  assert.equal(checkpoint.revisionId, original.activeRevisionId, 'Checkpoint identity must match the playing revision');
  await studio.click('restore-checkpoint');
  assert.match(studio.element('#toast').textContent, /Checkpoint restored/);
  await studio.generate('more enemies');
  await studio.click('save');
  saved = readProjects()[0]!;
  assert.equal(saved.revisions.length, 3);
  assert.equal(saved.revisions[2]!.spec.enemyCount, original.revisions[0]!.spec.enemyCount + 4);
  assert.equal(studio.element('#game-frame').src, playingUrl);
  await studio.click('open-project', { id: saved.id });
  assert.equal(new URL(studio.element('#game-frame').src).searchParams.get('revision'), saved.activeRevisionId);
  studio.reportState(saved.revisions[2]!.spec);
  await studio.click('restore-checkpoint');
  assert.match(studio.element('#toast').textContent, /another revision/);
  await studio.generate('a forest adventure named "Another world"');
  await studio.click('save');
  assert.equal(readProjects().length, 2, 'Generating a different game must keep the original project');
  assert.equal(readProjects().find((p) => p.id === original.id)!.revisions.length, 3);
});

test('switching inspiration during generation preserves both projects and the selected preview', async (t) => {
  const studio = await studioFixture(t);
  const original = readProjects()[0]!;
  let selectedUrl = '';
  await studio.generate('more enemies', async () => {
    await studio.click('example', { index: '1' });
    selectedUrl = studio.element('#game-frame').src;
  });
  await studio.click('save');
  assert.equal(studio.element('#game-frame').src, selectedUrl);
  assert.equal(readProjects().length, 2);
  assert.equal(readProjects().find((p) => p.id === original.id)!.revisions.length, 2);
  assert.equal(readProjects().find((p) => p.id !== original.id)!.revisions.length, 1);
});
