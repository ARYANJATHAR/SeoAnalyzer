CREATE TABLE projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, company_name TEXT NOT NULL, primary_domain TEXT NOT NULL,
  category TEXT NOT NULL, description TEXT NOT NULL, target_customer TEXT NOT NULL, market TEXT NOT NULL,
  conversion_event TEXT NOT NULL, brand_aliases TEXT NOT NULL, product_names TEXT NOT NULL,
  page_limit INTEGER NOT NULL CHECK(page_limit IN (25,50,100,250)), excluded_paths TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE brands (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL, domain TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('target','competitor')), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE INDEX brands_project_idx ON brands(project_id);
CREATE UNIQUE INDEX brands_active_domain_idx ON brands(project_id,domain) WHERE active=1;
CREATE TABLE previews (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), brand_id TEXT NOT NULL REFERENCES brands(id),
  discovery TEXT NOT NULL, settings TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE crawl_runs (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), brand_id TEXT NOT NULL REFERENCES brands(id),
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','cancelled','failed')),
  settings TEXT NOT NULL, discovery TEXT NOT NULL, pages_discovered INTEGER NOT NULL DEFAULT 0,
  pages_processed INTEGER NOT NULL DEFAULT 0, pages_fetched INTEGER NOT NULL DEFAULT 0,
  pages_failed INTEGER NOT NULL DEFAULT 0, pages_skipped INTEGER NOT NULL DEFAULT 0,
  cancel_requested INTEGER NOT NULL DEFAULT 0, worker_id TEXT, heartbeat_at TEXT, error_summary TEXT,
  created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT
);
CREATE INDEX runs_project_idx ON crawl_runs(project_id);
CREATE INDEX runs_queue_idx ON crawl_runs(status);
CREATE UNIQUE INDEX runs_active_brand_idx ON crawl_runs(brand_id) WHERE status IN ('queued','running');
CREATE TABLE pages (
  id TEXT PRIMARY KEY, crawl_run_id TEXT NOT NULL REFERENCES crawl_runs(id), brand_id TEXT NOT NULL REFERENCES brands(id),
  url TEXT NOT NULL, final_url TEXT, canonical_url TEXT, status TEXT NOT NULL CHECK(status IN ('fetched','failed','skipped')),
  status_code INTEGER, content_type TEXT, title TEXT, meta_description TEXT, headings TEXT NOT NULL,
  visible_text TEXT, text_hash TEXT, word_count INTEGER, language TEXT,
  internal_links TEXT NOT NULL, external_links TEXT NOT NULL, structured_data TEXT NOT NULL,
  robots_directives TEXT NOT NULL, redirects TEXT NOT NULL, in_sitemap INTEGER NOT NULL,
  error TEXT, fetched_at TEXT NOT NULL, UNIQUE(crawl_run_id,url)
);
CREATE INDEX pages_run_idx ON pages(crawl_run_id);
