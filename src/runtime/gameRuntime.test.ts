import assert from 'node:assert/strict';
import test from 'node:test';
import { EntityRegistry, GameRuntime } from './index';
import type { CreateEntityArgs, EntityPosition, ManagedEntity, RuntimeBindings } from './index';

function createTestRuntime(): GameRuntime {
  const registry = new EntityRegistry();
  const bindings: RuntimeBindings = {
    createEntity: (args) => ({ ok: true, data: makeEntity(args) }),
    getGameState: () => ({ mode: 'test', score: 3 }),
    resetGame: () => registry.clear(),
  };
  return new GameRuntime(registry, bindings);
}

function makeEntity(args: CreateEntityArgs): ManagedEntity {
  let position: EntityPosition = { ...args.position } as EntityPosition;
  let size: EntityPosition = args.properties?.size
    ? { ...args.properties.size } as EntityPosition
    : args.dimension === '2d' ? { x: 1, y: 1 } : { x: 1, y: 1, z: 1 };
  let speed = 0;
  let rotation = 0;
  const object = { destroyed: false };
  return {
    id: args.id,
    type: args.type,
    dimension: args.dimension,
    object,
    getPosition: () => ({ ...position } as EntityPosition),
    setPosition: (value) => { position = { ...value } as EntityPosition; },
    getSize: () => ({ ...size } as EntityPosition),
    setSize: (value) => { size = { ...value } as EntityPosition; },
    getSpeed: () => speed,
    setSpeed: (value) => { speed = value; },
    getRotation: () => rotation,
    setRotation: (value) => { rotation = value; },
    destroy: () => { object.destroyed = true; },
    isDestroyed: () => object.destroyed,
  };
}

test('creates, retrieves, and lists registered entities', () => {
  const runtime = createTestRuntime();
  const created = runtime.createEntity({
    id: 'player-1',
    type: 'player',
    dimension: '2d',
    position: { x: 2, y: -3 },
    properties: { size: { x: 0.8, y: 0.8 }, speed: 6 },
  });

  assert.equal(created.ok, true);
  assert.deepEqual(runtime.getEntity('player-1'), {
    ok: true,
    data: {
      id: 'player-1', type: 'player', dimension: '2d',
      position: { x: 2, y: -3 }, size: { x: 0.8, y: 0.8 },
      properties: { speed: 6, rotation: 0 },
    },
  });
  const listed = runtime.listEntities();
  assert.equal(listed.ok, true);
  if (listed.ok) assert.equal(listed.data.length, 1);
});

test('rejects duplicate IDs before creating another object', () => {
  const runtime = createTestRuntime();
  runtime.createEntity({ id: 'coin-1', type: 'coin', dimension: '2d', position: { x: 0, y: 0 } });
  const duplicate = runtime.createEntity({ id: 'coin-1', type: 'coin', dimension: '2d', position: { x: 1, y: 1 } });
  assert.deepEqual(duplicate, {
    ok: false,
    error: { code: 'DUPLICATE_ID', message: 'Entity ID "coin-1" is already registered.' },
  });
});

test('updates live entity position and supported properties', () => {
  const runtime = createTestRuntime();
  runtime.createEntity({ id: 'enemy-1', type: 'enemy', dimension: '3d', position: { x: 0, y: 1, z: 2 } });
  const moved = runtime.setEntityPosition('enemy-1', { x: 4, y: 2, z: -1 });
  assert.deepEqual(moved, { ok: true, data: { id: 'enemy-1', position: { x: 4, y: 2, z: -1 } } });
  const updated = runtime.setEntityProperties('enemy-1', { size: { x: 2, y: 3, z: 4 }, speed: 2.5, rotation: 1.2 });
  assert.equal(updated.ok, true);
  if (updated.ok) assert.deepEqual(updated.data.properties, { speed: 2.5, rotation: 1.2 });
});

test('rejects invalid coordinates and unknown IDs with structured errors', () => {
  const runtime = createTestRuntime();
  const invalid = runtime.createEntity({ id: 'bad', type: 'coin', dimension: '2d', position: { x: Number.NaN, y: 0 } });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.code, 'INVALID_ARGUMENT');

  const missing = runtime.setEntityPosition('missing', { x: 0, y: 0 });
  assert.deepEqual(missing, {
    ok: false,
    error: { code: 'ENTITY_NOT_FOUND', message: 'No active entity exists with ID "missing".' },
  });
});

test('deletion destroys the object and removes its registry entry', () => {
  const runtime = createTestRuntime();
  runtime.createEntity({ id: 'obstacle-1', type: 'obstacle', dimension: '2d', position: { x: 0, y: 0 } });
  assert.deepEqual(runtime.deleteEntity('obstacle-1'), { ok: true, data: { id: 'obstacle-1' } });
  const missing = runtime.getEntity('obstacle-1');
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, 'ENTITY_NOT_FOUND');
});
