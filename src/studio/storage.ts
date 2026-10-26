import { checkpointSchema, parseProject } from './spec';
import type { Project, Revision } from './spec';
import type { WorldState } from './engine';

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
