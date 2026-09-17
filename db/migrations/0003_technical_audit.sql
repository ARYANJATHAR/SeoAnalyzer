ALTER TABLE pages ADD COLUMN technical_signals TEXT;
ALTER TABLE crawl_runs ADD COLUMN site_signals TEXT;
ALTER TABLE crawl_runs ADD COLUMN audit_error TEXT;
CREATE TABLE audit_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  crawl_run_id TEXT NOT NULL REFERENCES crawl_runs(id),
  rule_version TEXT NOT NULL,
  pages_analyzed INTEGER NOT NULL,
  coverage TEXT NOT NULL,
  warnings TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(crawl_run_id, rule_version)
);
CREATE INDEX audit_runs_project_idx ON audit_runs(project_id);
CREATE TABLE audit_issues (
  id TEXT PRIMARY KEY,
  audit_run_id TEXT NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES pages(id),
  rule_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('error','warning','observation')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  fix TEXT NOT NULL,
  url TEXT NOT NULL,
  evidence TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX audit_issues_run_idx ON audit_issues(audit_run_id);
CREATE INDEX audit_issues_page_idx ON audit_issues(page_id);
