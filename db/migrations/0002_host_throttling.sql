-- Share host request limits between the web preview process and crawl worker.
CREATE TABLE host_limits (
  hostname TEXT PRIMARY KEY,
  last_start INTEGER NOT NULL DEFAULT 0,
  next_start INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE host_requests (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX host_requests_host_idx ON host_requests(hostname, expires_at);
