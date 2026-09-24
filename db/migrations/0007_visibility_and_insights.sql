CREATE TABLE experiments (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 mode TEXT NOT NULL CHECK(mode IN ('api','manual','demo')), context TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued', cancel_requested INTEGER NOT NULL DEFAULT 0,
 worker_id TEXT, heartbeat_at TEXT, error TEXT, created_at TEXT NOT NULL, completed_at TEXT
);
CREATE INDEX experiments_project_idx ON experiments(project_id,created_at);
CREATE UNIQUE INDEX experiments_active_idx ON experiments(project_id) WHERE status IN ('queued','running') AND mode='api';
CREATE TABLE experiment_answers (
 id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', payload TEXT NOT NULL,
 error TEXT, updated_at TEXT NOT NULL, UNIQUE(experiment_id,ordinal)
);
CREATE INDEX experiment_answers_run_idx ON experiment_answers(experiment_id);
CREATE TABLE content_runs (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 context TEXT NOT NULL, result TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
 cancel_requested INTEGER NOT NULL DEFAULT 0, worker_id TEXT, heartbeat_at TEXT, error TEXT,
 created_at TEXT NOT NULL, completed_at TEXT
);
CREATE INDEX content_runs_project_idx ON content_runs(project_id,created_at);
CREATE UNIQUE INDEX content_runs_active_idx ON content_runs(project_id) WHERE status IN ('queued','running');
ALTER TABLE ai_usage ADD COLUMN experiment_id TEXT REFERENCES experiments(id);
ALTER TABLE ai_usage ADD COLUMN content_run_id TEXT REFERENCES content_runs(id);
CREATE INDEX ai_usage_experiment_idx ON ai_usage(experiment_id);
CREATE INDEX ai_usage_content_idx ON ai_usage(content_run_id);

