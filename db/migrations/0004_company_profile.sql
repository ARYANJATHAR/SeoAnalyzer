CREATE TABLE ai_settings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  settings TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE profile_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  brand_id TEXT NOT NULL REFERENCES brands(id),
  crawl_run_id TEXT NOT NULL REFERENCES crawl_runs(id),
  status TEXT NOT NULL,
  settings TEXT NOT NULL,
  page_ids TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  force INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  facts_created INTEGER NOT NULL DEFAULT 0,
  warnings TEXT NOT NULL,
  error TEXT,
  worker_id TEXT,
  heartbeat_at TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX profile_jobs_project_idx ON profile_jobs(project_id);
CREATE INDEX profile_jobs_status_idx ON profile_jobs(status);
CREATE TABLE ai_usage (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  job_id TEXT REFERENCES profile_jobs(id),
  purpose TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  cache_key TEXT,
  served_model TEXT,
  upstream TEXT,
  status TEXT NOT NULL,
  http_status INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost REAL,
  error TEXT,
  request_text TEXT NOT NULL,
  response_text TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX ai_usage_project_idx ON ai_usage(project_id);
CREATE INDEX ai_usage_cache_idx ON ai_usage(project_id, cache_key);
CREATE TABLE company_facts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  brand_id TEXT NOT NULL REFERENCES brands(id),
  job_id TEXT REFERENCES profile_jobs(id),
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  attribute TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL,
  sources TEXT NOT NULL,
  origin TEXT NOT NULL,
  status TEXT NOT NULL,
  review_note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX company_facts_brand_idx ON company_facts(project_id, brand_id);
CREATE TABLE fact_revisions (
  id TEXT PRIMARY KEY,
  fact_id TEXT NOT NULL REFERENCES company_facts(id),
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL
);
