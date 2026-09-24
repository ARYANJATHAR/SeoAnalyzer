ALTER TABLE research_flows ADD COLUMN experiment_id TEXT REFERENCES experiments(id);
ALTER TABLE research_flows ADD COLUMN content_run_id TEXT REFERENCES content_runs(id);
ALTER TABLE research_flows ADD COLUMN related_jobs TEXT NOT NULL DEFAULT '{"crawls":[],"profiles":[]}';
ALTER TABLE research_flows ADD COLUMN incomplete INTEGER NOT NULL DEFAULT 0;
