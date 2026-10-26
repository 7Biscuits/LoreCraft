import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProject, gameSpecSchema } from '../studio/spec.ts';
import type { Project } from '../studio/spec.ts';

export class ProjectConflict extends Error { constructor() { super('Project changed during generation. Reload its latest revision and retry.'); } }
export class ProjectNotFound extends Error { constructor() { super('Project not found.'); } }
/** Local durable store shared by Vite and MCP; migrations never require a hosted DB. */
export class ProjectStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [index, file] of ['001_projects.sql', '002_context.sql'].entries()) {
        const version = index + 1;
        if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(version)) {
          this.db.exec(readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8'));
          this.db.prepare('INSERT INTO schema_migrations(version) VALUES (?)').run(version);
        }
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }
  }
  get(id: string): Project {
    const row = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id);
    if (!row) throw new ProjectNotFound();
    const revisions = this.db.prepare('SELECT data FROM project_revisions WHERE project_id=? ORDER BY rowid').all(id).map((r) => JSON.parse(String(r.data)));
    const context = JSON.parse(String(row.context));
    return parseProject({ storage: 'server', version: 1, id, createdAt: row.created_at, updatedAt: row.updated_at, activeRevisionId: row.active_revision_id, revisions, ...(Object.keys(context).length ? { context } : {}) });
  }
  listMetadata() {
    return this.db.prepare('SELECT p.id,p.updated_at,r.id AS revision_id,r.data FROM projects p JOIN project_revisions r ON r.id=p.active_revision_id ORDER BY p.updated_at DESC LIMIT 200').all().map((row) => {
      const spec = gameSpecSchema.parse(JSON.parse(String(row.data)).spec);
      return { id: String(row.id), updatedAt: String(row.updated_at), revisionId: String(row.revision_id), title: spec.title, description: spec.description, genre: spec.genre, theme: spec.theme };
    });
  }
  list(): Project[] { return this.db.prepare('SELECT id FROM projects ORDER BY updated_at DESC LIMIT 200').all().map((row) => this.get(String(row.id))); }
  save(value: Project, expectedRevision?: string): Project {
    const project = parseProject(value);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.db.prepare('SELECT active_revision_id FROM projects WHERE id=?').get(project.id);
      if (current && current.active_revision_id !== expectedRevision || !current && expectedRevision) throw new ProjectConflict();
      this.db.prepare('INSERT INTO projects(id,created_at,updated_at,active_revision_id,context) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,active_revision_id=excluded.active_revision_id,context=excluded.context')
        .run(project.id, project.createdAt, project.updatedAt, project.activeRevisionId, JSON.stringify(project.context ?? {}));
      this.db.prepare('DELETE FROM project_revisions WHERE project_id=?').run(project.id);
      const insert = this.db.prepare('INSERT INTO project_revisions(id,project_id,data) VALUES (?,?,?)');
      for (const revision of project.revisions) insert.run(revision.id, project.id, JSON.stringify(revision));
      this.db.exec('COMMIT'); return project;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
const stores = new Map<string, ProjectStore>();
export function projectStore(root = fileURLToPath(new URL('../../', import.meta.url))): ProjectStore {
  const path = process.env.LORECRAFT_PROJECT_DB ?? join(root, '.lorecraft', 'projects.sqlite');
  let store = stores.get(path); if (!store) { store = new ProjectStore(path); stores.set(path, store); } return store;
}
