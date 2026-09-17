import { index, integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import type { AiSettings, FactSource, FactStatus, ProviderId } from "../lib/ai/types";
import type { CrawlSettings, Discovery, Heading, PageStatus, Redirect, RunStatus, SchemaEntry } from "../lib/types";
import type { Evidence, RuleCoverage, Severity, SiteSignals, TechnicalSignals } from "../lib/audit/types";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  companyName: text("company_name").notNull(), primaryDomain: text("primary_domain").notNull(),
  category: text("category").notNull(), description: text("description").notNull(),
  targetCustomer: text("target_customer").notNull(), market: text("market").notNull(),
  conversionEvent: text("conversion_event").notNull(),
  brandAliases: text("brand_aliases", { mode: "json" }).$type<string[]>().notNull(),
  productNames: text("product_names", { mode: "json" }).$type<string[]>().notNull(),
  pageLimit: integer("page_limit").notNull(),
  excludedPaths: text("excluded_paths", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export const brands = sqliteTable("brands", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(), domain: text("domain").notNull(),
  kind: text("kind", { enum: ["target", "competitor"] }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true), createdAt: text("created_at").notNull(),
}, (t) => [index("brands_project_idx").on(t.projectId)]);
export const previews = sqliteTable("previews", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id),
  brandId: text("brand_id").notNull().references(() => brands.id),
  discovery: text("discovery", { mode: "json" }).$type<Discovery>().notNull(),
  settings: text("settings", { mode: "json" }).$type<CrawlSettings>().notNull(),
  expiresAt: text("expires_at").notNull(), createdAt: text("created_at").notNull(),
});
export const crawlRuns = sqliteTable("crawl_runs", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id),
  brandId: text("brand_id").notNull().references(() => brands.id),
  status: text("status").$type<RunStatus>().notNull(),
  settings: text("settings", { mode: "json" }).$type<CrawlSettings>().notNull(),
  discovery: text("discovery", { mode: "json" }).$type<Discovery>().notNull(),
  pagesDiscovered: integer("pages_discovered").notNull().default(0),
  pagesProcessed: integer("pages_processed").notNull().default(0),
  pagesFetched: integer("pages_fetched").notNull().default(0),
  pagesFailed: integer("pages_failed").notNull().default(0),
  pagesSkipped: integer("pages_skipped").notNull().default(0),
  cancelRequested: integer("cancel_requested", { mode: "boolean" }).notNull().default(false),
  workerId: text("worker_id"), heartbeatAt: text("heartbeat_at"),
  errorSummary: text("error_summary"), createdAt: text("created_at").notNull(),
  siteSignals: text("site_signals", { mode: "json" }).$type<SiteSignals>(),
  auditError: text("audit_error"),
  startedAt: text("started_at"), completedAt: text("completed_at"),
}, (t) => [index("runs_project_idx").on(t.projectId), index("runs_queue_idx").on(t.status)]);
export const pages = sqliteTable("pages", {
  id: text("id").primaryKey(), crawlRunId: text("crawl_run_id").notNull().references(() => crawlRuns.id),
  brandId: text("brand_id").notNull().references(() => brands.id),
  url: text("url").notNull(), finalUrl: text("final_url"), canonicalUrl: text("canonical_url"),
  status: text("status").$type<PageStatus>().notNull(), statusCode: integer("status_code"),
  contentType: text("content_type"), title: text("title"), metaDescription: text("meta_description"),
  headings: text("headings", { mode: "json" }).$type<Heading[]>().notNull(),
  visibleText: text("visible_text"), textHash: text("text_hash"), wordCount: integer("word_count"),
  language: text("language"),
  internalLinks: text("internal_links", { mode: "json" }).$type<string[]>().notNull(),
  externalLinks: text("external_links", { mode: "json" }).$type<string[]>().notNull(),
  structuredData: text("structured_data", { mode: "json" }).$type<SchemaEntry[]>().notNull(),
  robotsDirectives: text("robots_directives", { mode: "json" }).$type<string[]>().notNull(),
  redirects: text("redirects", { mode: "json" }).$type<Redirect[]>().notNull(),
  inSitemap: integer("in_sitemap", { mode: "boolean" }).notNull(),
  error: text("error"), fetchedAt: text("fetched_at").notNull(),
  technicalSignals: text("technical_signals", { mode: "json" }).$type<TechnicalSignals>(),
}, (t) => [index("pages_run_idx").on(t.crawlRunId)]);

export const hostLimits = sqliteTable("host_limits", {
  hostname: text("hostname").primaryKey(), lastStart: integer("last_start").notNull().default(0), nextStart: integer("next_start").notNull().default(0),
});
export const hostRequests = sqliteTable("host_requests", {
  id: text("id").primaryKey(), hostname: text("hostname").notNull(), expiresAt: integer("expires_at").notNull(),
}, (t) => [index("host_requests_host_idx").on(t.hostname, t.expiresAt)]);

export const auditRuns = sqliteTable("audit_runs", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id),
  crawlRunId: text("crawl_run_id").notNull().references(() => crawlRuns.id), ruleVersion: text("rule_version").notNull(),
  pagesAnalyzed: integer("pages_analyzed").notNull(),
  coverage: text("coverage", { mode: "json" }).$type<RuleCoverage[]>().notNull(),
  warnings: text("warnings", { mode: "json" }).$type<string[]>().notNull(), createdAt: text("created_at").notNull(),
}, (t) => [index("audit_runs_project_idx").on(t.projectId), unique("audit_runs_crawl_version_unique").on(t.crawlRunId, t.ruleVersion)]);
export const auditIssues = sqliteTable("audit_issues", {
  id: text("id").primaryKey(), auditRunId: text("audit_run_id").notNull().references(() => auditRuns.id, { onDelete: "cascade" }),
  pageId: text("page_id").references(() => pages.id), ruleId: text("rule_id").notNull(),
  severity: text("severity").$type<Severity>().notNull(), category: text("category").notNull(), title: text("title").notNull(),
  explanation: text("explanation").notNull(), fix: text("fix").notNull(), url: text("url").notNull(),
  evidence: text("evidence", { mode: "json" }).$type<Evidence[]>().notNull(), createdAt: text("created_at").notNull(),
}, (t) => [index("audit_issues_run_idx").on(t.auditRunId), index("audit_issues_page_idx").on(t.pageId)]);

export type AuditIssue = typeof auditIssues.$inferSelect;
export const aiSettings = sqliteTable("ai_settings", {
  projectId: text("project_id").primaryKey().references(() => projects.id),
  settings: text("settings", { mode: "json" }).$type<AiSettings>().notNull(), updatedAt: text("updated_at").notNull(),
});
export const profileJobs = sqliteTable("profile_jobs", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id),
  brandId: text("brand_id").notNull().references(() => brands.id), crawlRunId: text("crawl_run_id").notNull().references(() => crawlRuns.id),
  status: text("status").$type<"queued" | "running" | "completed" | "partial" | "failed" | "cancelled">().notNull(),
  settings: text("settings", { mode: "json" }).$type<AiSettings>().notNull(), pageIds: text("page_ids", { mode: "json" }).$type<string[]>().notNull(),
  cacheKey: text("cache_key").notNull(), promptVersion: text("prompt_version").notNull(),
  force: integer("force", { mode: "boolean" }).notNull().default(false),
  processed: integer("processed").notNull().default(0), factsCreated: integer("facts_created").notNull().default(0),
  warnings: text("warnings", { mode: "json" }).$type<string[]>().notNull(), error: text("error"),
  workerId: text("worker_id"), heartbeatAt: text("heartbeat_at"), cancelRequested: integer("cancel_requested", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(), completedAt: text("completed_at"),
}, (t) => [index("profile_jobs_project_idx").on(t.projectId), index("profile_jobs_status_idx").on(t.status)]);
export const aiUsage = sqliteTable("ai_usage", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id), jobId: text("job_id").references(() => profileJobs.id),
  purpose: text("purpose").notNull(), provider: text("provider").$type<ProviderId>().notNull(), model: text("model").notNull(), servedModel: text("served_model"), upstream: text("upstream"),
  cacheKey: text("cache_key"),
  status: text("status").notNull(), httpStatus: integer("http_status"), inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"), cost: real("cost"),
  error: text("error"), requestText: text("request_text").notNull(), responseText: text("response_text"), createdAt: text("created_at").notNull(), completedAt: text("completed_at"),
}, (t) => [index("ai_usage_project_idx").on(t.projectId), index("ai_usage_cache_idx").on(t.projectId, t.cacheKey)]);
export const companyFacts = sqliteTable("company_facts", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id), brandId: text("brand_id").notNull().references(() => brands.id), jobId: text("job_id").references(() => profileJobs.id),
  category: text("category").notNull(), subject: text("subject").notNull(), attribute: text("attribute").notNull(), value: text("value").notNull(), confidence: real("confidence"),
  sources: text("sources", { mode: "json" }).$type<FactSource[]>().notNull(), origin: text("origin").$type<"model" | "human">().notNull(), status: text("status").$type<FactStatus>().notNull(),
  reviewNote: text("review_note").notNull().default(""), revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(), reviewedAt: text("reviewed_at"),
}, (t) => [index("company_facts_brand_idx").on(t.projectId, t.brandId)]);
export const factRevisions = sqliteTable("fact_revisions", {
  id: text("id").primaryKey(), factId: text("fact_id").notNull().references(() => companyFacts.id),
  snapshot: text("snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(), createdAt: text("created_at").notNull(),
});
export type ProfileJob = typeof profileJobs.$inferSelect;
export type CompanyFact = typeof companyFacts.$inferSelect;
export type AuditRun = typeof auditRuns.$inferSelect;

export type Project = typeof projects.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type CrawlRun = typeof crawlRuns.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type PageSummary = Pick<Page, "id" | "url" | "finalUrl" | "title" | "status" | "statusCode" | "wordCount" | "error" | "fetchedAt" | "brandId" | "crawlRunId">;
