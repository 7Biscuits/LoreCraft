import assert from 'node:assert/strict';
import test from 'node:test';
import { matchLocalDemo, localDemos, localDemoStages } from './localDemo';
import { gameCatalog } from '../games/manifest';

test('local keywords select existing games with Mario taking precedence over rush', () => {
  for (const prompt of ['MARIO', 'Make SuperMario', 'a super-mario game', 'Mario rush']) assert.equal(matchLocalDemo(prompt)?.id, 'super-mario', prompt);
  for (const prompt of ['rush', 'RUSH through a maze', 'Maze Escape', 'a labyrinth game']) assert.equal(matchLocalDemo(prompt)?.id, 'maze-escape', prompt);
  for (const prompt of ['a platformer', 'marionette theatre', 'brush painting', 'forest adventure', 'space shooter']) assert.equal(matchLocalDemo(prompt), undefined, prompt);
  for (const game of localDemos) assert.ok(gameCatalog.some((entry) => entry.id === game.id));
  const duration = localDemoStages.reduce((sum, stage) => sum + stage.duration, 0);
  assert.ok(duration >= 5000 && duration <= 10000);
});
