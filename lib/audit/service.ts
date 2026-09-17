import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";
import { database } from "../../db";
import { auditIssues, auditRuns, brands, crawlRuns, pages } from "../../db/schema";
import { getProject } from "../../db/repositories/projects";
import { InputError } from "../security/url";
import { evaluateAudit, RULE_VERSION } from "./engine";

export function runAudit(crawlId: string) {
  const { db } = database();
  const run = db.select().from(crawlRuns).where(eq(crawlRuns.id, crawlId)).get();
  if (!run) throw new InputError("Crawl not found.", 404);
  if (["queued", "running"].includes(run.status)) throw new InputError("Wait until this crawl stops before auditing its saved evidence.", 409);
  const existing = db.select().from(auditRuns).where(and(eq(auditRuns.crawlRunId, crawlId), eq(auditRuns.ruleVersion, RULE_VERSION))).get();
  if (existing) return existing;
  try {
    const output = evaluateAudit(run, db.select().from(pages).where(eq(pages.crawlRunId, crawlId)).orderBy(asc(pages.url)).all());
    return db.transaction((tx) => {
      // A worker and a manual request may reach this point together.
      const saved = tx.select().from(auditRuns).where(and(eq(auditRuns.crawlRunId, crawlId), eq(auditRuns.ruleVersion, RULE_VERSION))).get();
      if (saved) return saved;
      const id = randomUUID(), createdAt = new Date().toISOString();
      const audit = tx.insert(auditRuns).values({ id, projectId: run.projectId, crawlRunId: crawlId, ruleVersion: RULE_VERSION, pagesAnalyzed: output.pagesAnalyzed, coverage: output.coverage, warnings: output.warnings, createdAt }).returning().get()!;
      for (const finding of output.findings) tx.insert(auditIssues).values({ ...finding, id: randomUUID(), auditRunId: id, createdAt }).run();
      tx.update(crawlRuns).set({ auditError: null }).where(eq(crawlRuns.id, crawlId)).run();
      return audit;
    }, { behavior: "immediate" });
  } catch (error) {
    db.update(crawlRuns).set({ auditError: "The technical audit could not finish. Collected pages are preserved; retry the audit." }).where(eq(crawlRuns.id, crawlId)).run();
    throw error;
  }
}

export type AuditFilters = { runId?: string; brandId?: string; severity?: string; category?: string; ruleId?: string; query?: string; page?: number };
export function projectAudits(projectId: string, filters: AuditFilters = {}) {
  getProject(projectId);
  const { db } = database();
  const tracked = db.select().from(brands).where(eq(brands.projectId, projectId)).all();
  const summaryColumns = { ...getTableColumns(crawlRuns), siteSignals: sql<null>`null` };
  const selected = filters.runId ? db.select(summaryColumns).from(crawlRuns).where(and(eq(crawlRuns.id, filters.runId), eq(crawlRuns.projectId, projectId))).all() : tracked.filter((brand) => brand.active).flatMap((brand) => {
    const run = db.select(summaryColumns).from(crawlRuns).where(eq(crawlRuns.brandId, brand.id)).orderBy(desc(crawlRuns.createdAt)).get();
    return run ? [run] : [];
  });
  if (filters.runId && !selected.length) throw new InputError("Crawl not found in this project.", 404);
  const runs = selected.filter((run) => !filters.brandId || run.brandId === filters.brandId).map((run) => ({
    crawlId: run.id, brandId: run.brandId, brandName: tracked.find((brand) => brand.id === run.brandId)?.name || "Website",
    origin: run.discovery.origin, crawlCreatedAt: run.createdAt, crawlCompletedAt: run.completedAt, crawlStatus: run.status,
    processed: run.pagesProcessed, discovered: run.pagesDiscovered, pageLimit: run.settings.pageLimit, error: run.auditError,
    audit: db.select().from(auditRuns).where(and(eq(auditRuns.crawlRunId, run.id), eq(auditRuns.ruleVersion, RULE_VERSION))).get() || null,
  }));
  const ids = runs.flatMap((run) => run.audit ? [run.audit.id] : []);
  const scope = inArray(auditIssues.auditRunId, ids);
  const counts = { error: 0, warning: 0, observation: 0 };
  if (ids.length) for (const row of db.select({ severity: auditIssues.severity, count: sql<number>`count(*)` }).from(auditIssues).where(scope).groupBy(auditIssues.severity).all()) counts[row.severity] = row.count;
  const categories = ids.length ? db.selectDistinct({ value: auditIssues.category }).from(auditIssues).where(scope).orderBy(asc(auditIssues.category)).all().map((row) => row.value) : [];
  const rules = ids.length ? db.selectDistinct({ id: auditIssues.ruleId, title: auditIssues.title }).from(auditIssues).where(scope).orderBy(asc(auditIssues.title)).all() : [];
  const query = (filters.query || "").slice(0, 200).replace(/[\\%_]/g, "\\$&");
  const where = and(scope,
    filters.severity && ["error", "warning", "observation"].includes(filters.severity) ? eq(auditIssues.severity, filters.severity as "error" | "warning" | "observation") : undefined,
    filters.category ? eq(auditIssues.category, filters.category) : undefined,
    filters.ruleId ? eq(auditIssues.ruleId, filters.ruleId) : undefined,
    query ? or(sql`${auditIssues.url} LIKE ${`%${query}%`} ESCAPE ${"\\"}`, sql`${auditIssues.title} LIKE ${`%${query}%`} ESCAPE ${"\\"}`) : undefined);
  const total = ids.length ? db.select({ count: sql<number>`count(*)` }).from(auditIssues).where(where).get()!.count : 0;
  const page = Math.max(1, Math.min(Number.isFinite(filters.page) ? Math.floor(filters.page!) : 1, Math.max(1, Math.ceil(total / 20))));
  const issues = ids.length ? db.select({ id: auditIssues.id, auditRunId: auditIssues.auditRunId, pageId: auditIssues.pageId, ruleId: auditIssues.ruleId, severity: auditIssues.severity, category: auditIssues.category, title: auditIssues.title, url: auditIssues.url }).from(auditIssues).where(where).orderBy(sql`CASE ${auditIssues.severity} WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END`, asc(auditIssues.ruleId), asc(auditIssues.url)).limit(20).offset((page - 1) * 20).all() : [];
  return { ruleVersion: RULE_VERSION, runs, counts, categories, rules, issues, total, page };
}
export type ProjectAudits = ReturnType<typeof projectAudits>;

export function pageAudit(pageId: string) {
  const { db } = database();
  const page = db.select({ crawlId: pages.crawlRunId }).from(pages).where(eq(pages.id, pageId)).get();
  if (!page) throw new InputError("Page not found.", 404);
  const audit = db.select().from(auditRuns).where(and(eq(auditRuns.crawlRunId, page.crawlId), eq(auditRuns.ruleVersion, RULE_VERSION))).get() || null;
  const issues = audit ? db.select().from(auditIssues).where(and(eq(auditIssues.auditRunId, audit.id), eq(auditIssues.pageId, pageId))).all() : [];
  return { audit, issues };
}
export type PageAudit = ReturnType<typeof pageAudit>;

export function getIssue(id: string) {
  const issue = database().db.select().from(auditIssues).where(eq(auditIssues.id, id)).get();
  if (!issue) throw new InputError("Audit issue not found.", 404);
  return issue;
}
