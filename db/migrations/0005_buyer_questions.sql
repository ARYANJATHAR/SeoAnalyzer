CREATE TABLE question_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL,
  settings TEXT NOT NULL,
  context TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  questions_created INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  worker_id TEXT,
  heartbeat_at TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX question_jobs_status_idx ON question_jobs(status);
CREATE INDEX question_jobs_project_idx ON question_jobs(project_id);
CREATE TABLE buyer_personas (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  job_id TEXT REFERENCES question_jobs(id),
  role TEXT NOT NULL,
  company_type TEXT NOT NULL,
  primary_pain TEXT NOT NULL,
  purchase_criteria TEXT NOT NULL,
  objections TEXT NOT NULL,
  sophistication TEXT NOT NULL,
  importance INTEGER NOT NULL,
  rationale TEXT NOT NULL,
  source_fact_ids TEXT NOT NULL,
  origin TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX buyer_personas_project_idx ON buyer_personas(project_id);
CREATE TABLE buyer_questions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  job_id TEXT REFERENCES question_jobs(id),
  persona_id TEXT NOT NULL REFERENCES buyer_personas(id),
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  stage TEXT NOT NULL,
  type TEXT NOT NULL,
  geography TEXT NOT NULL,
  intent INTEGER NOT NULL,
  expected_brand_ids TEXT NOT NULL,
  target_fact_ids TEXT NOT NULL,
  target_fact_needs TEXT NOT NULL,
  branded INTEGER NOT NULL,
  origin TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  selected INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX buyer_questions_project_idx ON buyer_questions(project_id);
CREATE UNIQUE INDEX buyer_questions_text_idx ON buyer_questions(project_id, normalized_text);
ALTER TABLE ai_usage ADD COLUMN question_job_id TEXT REFERENCES question_jobs(id);
CREATE INDEX ai_usage_question_job_idx ON ai_usage(question_job_id);
