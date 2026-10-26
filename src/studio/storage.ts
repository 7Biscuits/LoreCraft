import { checkpointSchema, parseProject } from './spec';
import type { Project, Revision } from './spec';
import type { WorldState } from './engine';
import * as z from 'zod/v4';

const key = 'lorecraft.projects.v1';
export function readProjects(): Project[] {
  const value = localStorage.getItem(key); if (!value) return [];
  const parsed: unknown = JSON.parse(value); if (!Array.isArray(parsed)) throw new Error('Saved project library is invalid. Export or clear browser storage to recover.');
  return parsed.map(parseProject);
}
export function saveProject(project: Project): void {
  const projects = readProjects().filter((p) => p.id !== project.id);
  localStorage.setItem(key, JSON.stringify([project, ...projects].slice(0, 30)));
}
export function deleteProject(id: string): void { localStorage.setItem(key, JSON.stringify(readProjects().filter((p) => p.id !== id))); localStorage.removeItem(`lorecraft.checkpoint.${id}`); }
export function newProject(revision: Revision): Project { return { version: 1, id: crypto.randomUUID(), createdAt: revision.createdAt, updatedAt: revision.createdAt, revisions: [revision], activeRevisionId: revision.id }; }
export function saveCheckpoint(project: Project, state: WorldState): void { localStorage.setItem(`lorecraft.checkpoint.${project.id}`, JSON.stringify({ revisionId: project.activeRevisionId, state })); }
export function readCheckpoint(project: Project): WorldState {
  const value = localStorage.getItem(`lorecraft.checkpoint.${project.id}`); if (!value) throw new Error('Save a checkpoint first.');
  const parsed = JSON.parse(value) as { revisionId: string; state: WorldState };
  if (parsed.revisionId !== project.activeRevisionId) throw new Error('This checkpoint belongs to another revision. Restore that revision first.');
  return checkpointSchema.parse(parsed.state);
}

const sourceKey = 'lorecraft.source-games.v1';
const selectionKey = 'lorecraft.selection.v1';
const sourceGameSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).max(128), title: z.string().min(1).max(120),
  prompt: z.string().max(4000), createdAt: z.string().max(60), origin: z.enum(['local', 'agent']), jobId: z.string().max(128),
});
export type SavedSourceGame = z.infer<typeof sourceGameSchema>;
const sourceLibrarySchema = z.object({ games: z.array(sourceGameSchema).max(30), dismissedJobs: z.array(z.string().max(128)).max(100) });
const selectionSchema = z.object({ kind: z.enum(['project', 'source']), id: z.string().min(1).max(128) });
function readSourceLibrary() {
  const value = localStorage.getItem(sourceKey);
  return value ? sourceLibrarySchema.parse(JSON.parse(value)) : { games: [], dismissedJobs: [] };
}
export function readSourceGames(): SavedSourceGame[] { return readSourceLibrary().games; }
export function saveSourceGame(value: SavedSourceGame): boolean {
  const game = sourceGameSchema.parse(value), library = readSourceLibrary();
  // Polling the last completed agent job must not resurrect a deleted game.
  if (library.dismissedJobs.includes(game.jobId)) return false;
  const previous = library.games.find((g) => g.id === game.id);
  if (previous && previous.jobId !== game.jobId) library.dismissedJobs = [...new Set([...library.dismissedJobs, previous.jobId])].slice(-100);
  library.games = [game, ...library.games.filter((g) => g.id !== game.id)].slice(0, 30);
  localStorage.setItem(sourceKey, JSON.stringify(library));
  return true;
}
export function deleteSourceGame(id: string): void {
  const library = readSourceLibrary(), game = library.games.find((g) => g.id === id);
  if (game) library.dismissedJobs = [...new Set([...library.dismissedJobs, game.jobId])].slice(-100);
  library.games = library.games.filter((g) => g.id !== id);
  localStorage.setItem(sourceKey, JSON.stringify(library));
}
export function readSelection(): z.infer<typeof selectionSchema> | undefined {
  try { return selectionSchema.parse(JSON.parse(localStorage.getItem(selectionKey) ?? 'null')); } catch { return undefined; }
}
export function saveSelection(kind: 'project' | 'source', id: string): void { localStorage.setItem(selectionKey, JSON.stringify(selectionSchema.parse({ kind, id }))); }
export function clearSelection(): void { localStorage.removeItem(selectionKey); }
