import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { startStudio } from './app';
import { newProject, readProjects, readSelection, readSourceGames, saveProject, saveSourceGame } from './storage';
import { createGameEngine } from './engine';
import { compilePrompt, examples } from './spec';
import type { GameSpec } from './spec';
import { localDemoStages } from './localDemo';

type Listener = (event: any) => void;

// Exercise the studio's real event handlers and storage without starting a game
// engine. Only the browser surface is stubbed; project/generation logic is real.
async function studioFixture(t: TestContext, options: { empty?: boolean } = {}) {
  const elements = new Map<string, ReturnType<typeof makeElement>>();
  function makeElement() {
    const attributes = new Set<string>();
    const classes = new Set<string>();
    return {
      value: '', src: '', innerHTML: '', textContent: '', hidden: false,
      attributes, classes, listeners: new Map<string, Listener>(),
      classList: { add(name: string) { classes.add(name); }, remove(name: string) { classes.delete(name); }, toggle(name: string) { if (classes.has(name)) classes.delete(name); else classes.add(name); } },
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
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
  };
  const originals = Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const nativeTimeout = setTimeout;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  t.mock.method(globalThis, 'setTimeout', (callback: (...args: any[]) => void, delay?: number, ...args: any[]) => {
    const timer = nativeTimeout(callback, localDemoStages.some((stage) => stage.duration === delay) ? 5 : delay, ...args); timers.add(timer); return timer;
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
  if (!options.empty) {
    const spec = compilePrompt(examples[0].prompt);
    saveProject(newProject({ id: crypto.randomUUID(), prompt: examples[0].prompt, spec, source: 'local', createdAt: new Date().toISOString(), checks: [] }));
  }
  const send = (type: string, data: unknown, requestId?: string) => windowListeners.get('message')!({
    origin: globals.location.origin, source: element('#game-frame').contentWindow,
    data: { source: 'lorecraft-player', type, data, requestId },
  });
  const start = async () => {
    await startStudio();
    element('#game-frame').contentWindow.postMessage = (message) => {
      const { requestId } = message as { requestId?: string };
      if (requestId) send('response', { ok: true }, requestId);
    };
  };
  await start();
  const reload = async () => {
    windowListeners.get('pagehide')?.({});
    for (const timer of timers) clearTimeout(timer);
    elements.clear(); documentListeners.clear(); windowListeners.clear();
    await start();
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
  return { element, click, generate, reportState, reload, body: globals.document.body };
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

test('switching a saved source game during generation preserves the destination project', async (t) => {
  const studio = await studioFixture(t);
  const original = readProjects()[0]!;
  saveSourceGame({ id: 'maze-escape', title: 'Maze Escape', prompt: 'rush', origin: 'local', jobId: 'local-test', createdAt: new Date().toISOString() });
  await studio.reload();
  let selectedUrl = '';
  await studio.generate('more enemies', async () => {
    await studio.click('open-source-game', { id: 'maze-escape' });
    selectedUrl = studio.element('#game-frame').src;
  });
  await studio.click('save');
  assert.equal(studio.element('#game-frame').src, selectedUrl);
  assert.equal(readProjects().length, 1);
  assert.equal(readProjects().find((p) => p.id === original.id)!.revisions.length, 2);
  assert.equal(readSourceGames().length, 1);
});

test('local Mario and rush demos persist selection, reopen on refresh and can be deleted and recreated', async (t) => {
  const studio = await studioFixture(t, { empty: true });
  assert.doesNotMatch(studio.body.innerHTML, /A LITTLE INSPIRATION|Inspiration · Play|prompt-chips/);
  assert.equal(readProjects().length, 0);
  assert.equal(studio.element('#game-frame').src, 'about:blank');
  await studio.generate('Create a Super Mario platformer');
  assert.equal(readProjects().length, 0, 'The demo must not create an unrelated default project');
  assert.equal(readSourceGames()[0]?.id, 'super-mario');
  assert.deepEqual(readSelection(), { kind: 'source', id: 'super-mario' });
  for (let i = 0; i < localDemoStages.length; i++) assert.ok(studio.element(`#progress-${i}`).classes.has('done'));
  const marioUrl = new URL(studio.element('#game-frame').src);
  assert.equal(marioUrl.searchParams.get('game'), 'super-mario');
  assert.equal(marioUrl.searchParams.get('bridge'), '0');
  await studio.reload();
  const reopened = new URL(studio.element('#game-frame').src);
  assert.equal(reopened.searchParams.get('game'), 'super-mario');
  assert.notEqual(reopened.searchParams.get('session'), marioUrl.searchParams.get('session'));
  await studio.generate('Make a rush game');
  assert.equal(new URL(studio.element('#game-frame').src).searchParams.get('game'), 'maze-escape');
  assert.equal(readSourceGames().length, 2);
  const mazeUrl = studio.element('#game-frame').src;
  await studio.click('confirm-delete-source-game', { id: 'super-mario' });
  assert.equal(studio.element('#game-frame').src, mazeUrl, 'Deleting another game must preserve the selected preview');
  await studio.reload();
  assert.equal(new URL(studio.element('#game-frame').src).searchParams.get('game'), 'maze-escape');
  assert.deepEqual(readSourceGames().map((g) => g.id), ['maze-escape']);
  await studio.click('confirm-delete-source-game', { id: 'maze-escape' });
  await studio.reload();
  assert.equal(studio.element('#game-frame').src, 'about:blank');
  assert.deepEqual(readSourceGames(), []);
  assert.deepEqual(readProjects(), []);
  assert.equal(readSelection(), undefined);
  await studio.generate('Mario again');
  assert.equal(readSourceGames()[0]?.id, 'super-mario');
});

test('deleting the last studio-generated game stays empty after refresh', async (t) => {
  const studio = await studioFixture(t);
  await studio.click('confirm-delete', { id: readProjects()[0]!.id });
  await studio.reload();
  assert.deepEqual(readProjects(), []);
  assert.equal(readSelection(), undefined);
  assert.equal(studio.element('#game-frame').src, 'about:blank');
  await studio.generate('a new ocean shooter');
  assert.equal(readProjects().length, 1);
  assert.equal(readProjects()[0]!.revisions.length, 1);
  assert.equal(new URL(studio.element('#game-frame').src).searchParams.get('project'), readProjects()[0]!.id);
});
