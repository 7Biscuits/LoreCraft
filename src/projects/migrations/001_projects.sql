CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  active_revision_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE INDEX IF NOT EXISTS revisions_project ON project_revisions(project_id);
