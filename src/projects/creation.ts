import { randomUUID } from 'node:crypto';
import * as z from 'zod/v4';
import { gameSpecSchema, projectContextSchema } from '../studio/spec.ts';
import { generateGame } from '../studio/generator.ts';
import type { GeneratorOptions } from '../studio/generator.ts';
import { playtest } from '../studio/playtest.ts';
import { selectFoundation } from '../studio/foundations.ts';
import { assetLibrary } from '../studio/assets.ts';
import type { Project, Revision } from '../studio/spec.ts';
import type { ProjectStore } from './store.ts';

export const creationRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(4000), projectId: z.string().uuid().optional(),
  expectedRevision: z.string().uuid().optional(),
  previous: gameSpecSchema.optional(), context: projectContextSchema.optional(),
  spec: gameSpecSchema.optional(), patch: gameSpecSchema.partial().strict().optional(),
  instructions: z.string().max(1000).optional(), mode: z.enum(['local', 'ai']).default('local'),
}).strict().refine((v) => !(v.spec && v.patch), 'Use spec or patch, not both.').refine((v) => !v.expectedRevision || !!v.projectId, 'expectedRevision requires projectId.').refine((v) => !v.projectId || !v.previous, 'Use projectId or previous, not both.');
export type CreationRequest = z.input<typeof creationRequestSchema>;
export async function createProjectGame(body: unknown, store: ProjectStore, options: GeneratorOptions = {}) {
  const request = creationRequestSchema.parse(body);
  const previous = request.projectId ? store.get(request.projectId) : undefined;
  const active = previous?.revisions.find((r) => r.id === previous.activeRevisionId);
  if (request.expectedRevision && request.expectedRevision !== previous?.activeRevisionId) {
    const { ProjectConflict } = await import('./store.ts'); throw new ProjectConflict();
  }
  const baseSpec = active?.spec ?? request.previous;
  const context = projectContextSchema.parse(previous?.context ?? request.context ?? { summary: baseSpec?.description ?? '', instructions: '', turns: [] });
  if (request.instructions !== undefined) context.instructions = request.instructions;
  const generated = request.spec || request.patch
    ? { spec: gameSpecSchema.parse(request.spec ?? { ...baseSpec, ...request.patch }), source: 'local' as const, notes: [] }
    : await generateGame({ prompt: request.prompt, previous: baseSpec, mode: request.mode, context }, options);
  const checks = playtest(generated.spec);
  if (checks.some((c) => !c.passed)) throw new Error(`Game checks failed: ${checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`).join('; ')}`);
  const now = new Date().toISOString(), revision: Revision = { id: randomUUID(), prompt: request.prompt, spec: generated.spec, source: generated.source, checks, createdAt: now };
  const foundation = selectFoundation(generated.spec);
  context.summary = `${generated.spec.title}: ${generated.spec.description}`.slice(0, 2000);
  context.turns = [...context.turns, { role: 'user' as const, content: request.prompt.slice(0, 1500) }, { role: 'assistant' as const, content: `Applied ${foundation.label} specification revision ${revision.id}.` }].slice(-8);
  const project: Project = { storage: 'server', version: 1, id: previous?.id ?? randomUUID(), createdAt: previous?.createdAt ?? now, updatedAt: now, activeRevisionId: revision.id, revisions: [...previous?.revisions ?? [], revision].slice(-50), context };
  options.signal?.throwIfAborted();
  store.save(project, previous?.activeRevisionId);
  console.error('[lorecraft-creation]', JSON.stringify({ projectId: project.id, revisionId: revision.id, foundation: foundation.id, checks: checks.length }));
  return { project, spec: generated.spec, checks, foundation, diagnostics: { productionBuild: false, assets: Object.keys(assetLibrary), notes: generated.notes, preservedSeed: baseSpec ? baseSpec.seed === generated.spec.seed : false } };
}
