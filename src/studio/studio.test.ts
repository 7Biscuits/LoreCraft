import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { compilePrompt, examples, gameSpecSchema, parseProject } from './spec';
import { createGameEngine } from './engine';
import { playtest } from './playtest';
import { generateGame } from './api';
import { exportHtml } from './export';

test('sample prompts produce distinct playable genres and themes with all gameplay checks passing', () => {
  for (const example of examples) {
    const spec = compilePrompt(example.prompt);
    assert.equal(spec.genre, example.genre); assert.equal(spec.theme, example.theme);
    assert.deepEqual(playtest(spec).filter((check) => !check.passed), []);
  }
});

test('all genre/theme combinations retain reachable objectives at maximum collectible counts', () => {
  const original = compilePrompt('forest adventure');
  for (const theme of ['forest', 'space', 'dungeon', 'ocean', 'neon'] as const) for (const genre of ['adventure', 'shooter', 'survival', 'runner'] as const) {
    const spec = { ...original, theme, genre, collectibleCount: 16, enemyCount: 12 };
    assert.deepEqual(playtest(spec).filter((check) => !check.passed), [], `${theme}/${genre}`);
  }
});

test('prompt refinement preserves seed and supports counts, speed, difficulty, title, and genre changes', () => {
  const original = compilePrompt('a forest adventure with 6 crystals');
  const refined = compilePrompt('make it faster and easier with 3 enemies and 5 lives, called "Tiny Legend"', original);
  assert.equal(refined.seed, original.seed); assert.equal(refined.enemyCount, 3); assert.equal(refined.lives, 5); assert.equal(refined.difficulty, 'easy'); assert.equal(refined.title, 'Tiny Legend'); assert.ok(refined.playerSpeed > original.playerSpeed);
  const space = compilePrompt('change it to a space shooter', refined);
  assert.equal(space.theme, 'space'); assert.equal(space.genre, 'shooter'); assert.ok(!space.description.includes('forest adventure'));
});

test('project imports validate schemas, bounded history, and referenced active revisions', () => {
  const revision = { id: 'r', prompt: 'test', spec: compilePrompt('forest adventure'), source: 'local', createdAt: new Date().toISOString(), checks: [] };
  const project = { version: 1, id: 'p', activeRevisionId: 'r', createdAt: '', updatedAt: '', revisions: [revision] };
  assert.equal(parseProject(project).id, 'p');
  assert.throws(() => parseProject({ ...project, activeRevisionId: 'missing' }), /missing/);
  assert.throws(() => parseProject({ ...project, revisions: [{ ...revision, spec: { ...revision.spec, playerSpeed: 9999 } }] }));
});

test('local generation returns actual scenario results and AI mode fails explicitly without credentials', async () => {
  const result = await generateGame({ prompt: 'An ocean runner with 4 enemies for 30 seconds', mode: 'local' });
  assert.equal(compilePrompt('survive for a 30 second timer').timeLimit, 30);
  assert.equal(result.source, 'local'); assert.equal(result.spec.timeLimit, 30); assert.equal(result.checks.length, 10); assert.ok(result.checks.every((c) => c.passed));
  await assert.rejects(generateGame({ prompt: 'forest adventure', mode: 'ai' }), /not configured/);
  await assert.rejects(generateGame({ prompt: 'x', mode: 'local' }));
});

test('AI generation validates structured responses, repairs once, and never exposes the key in results', async () => {
  let calls = 0;
  const result = await generateGame({ prompt: 'a cosmic shooter', mode: 'ai' }, {
    apiKey: 'test-only-key',
    fetch: (async (_url, init) => {
      assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer test-only-key');
      const body = JSON.parse(init!.body as string); assert.equal(body.text.format.strict, true); assert.equal(body.store, false);
      return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: ++calls === 1 ? '{}' : JSON.stringify(compilePrompt('a cosmic space shooter')) }] }] }), { status: 200 });
    }) as typeof fetch,
  });
  assert.equal(calls, 2); assert.equal(result.source, 'ai'); assert.equal(result.spec.genre, 'shooter'); assert.ok(result.notes.length); assert.ok(!JSON.stringify(result).includes('test-only-key'));
});

test('entity deletion, damage, and checkpoints have explicit recoverable outcomes', () => {
  const e = createGameEngine(compilePrompt('easy forest adventure'));
  const initial = e.snapshot(); e.state.entities = e.state.entities.filter((v) => v.id !== 'player-1'); e.step(); assert.equal(e.state.outcome, 'lost');
  e.restore(initial); assert.equal(e.state.outcome, 'playing'); e.reset(); assert.deepEqual(e.snapshot(), initial);
});

test('standalone exports execute independently and safely encode hostile game titles', () => {
  const spec = gameSpecSchema.parse({ ...compilePrompt('a forest adventure'), title: '</script><img src=x onerror=alert(1)>' });
  const html = exportHtml(spec);
  assert.ok(!html.includes('<img src=x')); assert.ok(!html.includes('runtime-bridge')); assert.ok(!html.includes('https://'));
  const script = html.match(/<script>([\s\S]*)<\/script>/)![1]!;
  const context = new Proxy({}, { get: () => () => {} });
  const canvas = { getContext: () => context, focus() {} };
  let frame: ((time: number) => void) | undefined;
  const sandbox = { document: { querySelector: (selector: string) => selector === '#game' ? canvas : {}, querySelectorAll: () => [] }, addEventListener() {}, requestAnimationFrame(fn: (time: number) => void) { frame = fn; } };
  vm.runInNewContext(script, sandbox); assert.ok(frame); frame(16); assert.ok(frame);
});
