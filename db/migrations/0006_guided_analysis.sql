CREATE TABLE research_flows (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  brand_id TEXT NOT NULL REFERENCES brands(id),
  status TEXT NOT NULL DEFAULT 'running',
  stage TEXT NOT NULL DEFAULT 'collecting',
  refresh INTEGER NOT NULL DEFAULT 0,
  crawl_id TEXT REFERENCES crawl_runs(id),
  profile_job_id TEXT REFERENCES profile_jobs(id),
  question_job_id TEXT REFERENCES question_jobs(id),
  message TEXT,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE UNIQUE INDEX research_flows_active_idx ON research_flows(project_id) WHERE status = 'running';
CREATE INDEX research_flows_queue_idx ON research_flows(status, lease_until);
