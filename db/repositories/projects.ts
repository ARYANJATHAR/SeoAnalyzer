import { and, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { database } from "../index";
import { brands, crawlRuns, pages, previews, projects, researchFlows } from "../schema";
import type { ProjectInput } from "../../lib/types";
import { domainKey, InputError } from "../../lib/security/url";

// Large policy/file evidence belongs to audits, not workspace polling responses.
const summaryRunColumns = { ...getTableColumns(crawlRuns), siteSignals: sql<null>`null` };

export function getProject(id: string) {
  const project = database().db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) throw new InputError("Project not found.", 404);
  return project;
}

export function listProjects() {
  const { db } = database();
  return db.select().from(projects).orderBy(desc(projects.updatedAt)).all().map((project) => ({
    ...project,
    brands: db.select().from(brands).where(and(eq(brands.projectId, project.id), eq(brands.active, true))).all(),
    lastRun: db.select(summaryRunColumns).from(crawlRuns).where(eq(crawlRuns.projectId, project.id)).orderBy(desc(crawlRuns.createdAt)).get() || null,
  }));
}

export function saveProject(input: ProjectInput, id?: string) {
  const { db } = database();
  const projectId = id || randomUUID();
  const now = new Date().toISOString();
  db.transaction((tx) => {
    const { competitors, ...values } = input;
    if (id) {
      getProject(id);
      if (tx.select().from(researchFlows).where(and(eq(researchFlows.projectId, id), eq(researchFlows.status, "running"))).get()) throw new InputError("Stop the current analysis before changing project settings.", 409);
      const pending = tx.select().from(crawlRuns).where(and(eq(crawlRuns.projectId, id), inArray(crawlRuns.status, ["queued", "running"]))).get();
      if (pending) throw new InputError("Wait for the active crawl or cancel it before changing project settings.", 409);
      tx.update(projects).set({ ...values, updatedAt: now }).where(eq(projects.id, id)).run();
    } else {
      tx.insert(projects).values({ id: projectId, ...values, createdAt: now, updatedAt: now }).run();
    }
    const previous = tx.select().from(brands).where(eq(brands.projectId, projectId)).all();
    tx.update(brands).set({ active: false }).where(eq(brands.projectId, projectId)).run();
    const desired = [
      { name: values.companyName, domain: values.primaryDomain, kind: "target" as const },
      ...competitors.map((competitor) => ({ ...competitor, kind: "competitor" as const })),
    ];
    for (const brand of desired) {
      const existing = previous.find((item) => domainKey(item.domain) === domainKey(brand.domain) && item.kind === brand.kind);
      if (existing) tx.update(brands).set({ ...brand, active: true }).where(eq(brands.id, existing.id)).run();
      else tx.insert(brands).values({ ...brand, id: randomUUID(), projectId, active: true, createdAt: now }).run();
    }
    tx.delete(previews).where(eq(previews.projectId, projectId)).run();
  });
  return getProject(projectId);
}

export function projectSnapshot(id: string) {
  const { db } = database();
  const project = getProject(id);
  const trackedBrands = db.select().from(brands).where(eq(brands.projectId, id)).all();
  const runs = db.select(summaryRunColumns).from(crawlRuns).where(eq(crawlRuns.projectId, id)).orderBy(desc(crawlRuns.createdAt)).limit(100).all();
  return { project, brands: trackedBrands, runs: runs.map(({ discovery, ...run }) => ({
    ...run, siteSignals: null, discovery: { ...discovery, robotsText: "", pageUrls: [] },
  })) };
}

export type ProjectSnapshot = ReturnType<typeof projectSnapshot>;

export function pageInventory(projectId: string, runId?: string) {
  getProject(projectId);
  const { db } = database();
  let ids: string[];
  if (runId) {
    const run = db.select().from(crawlRuns).where(and(eq(crawlRuns.id, runId), eq(crawlRuns.projectId, projectId))).get();
    if (!run) throw new InputError("Crawl not found.", 404);
    ids = [run.id];
  } else {
    const active = db.select().from(brands).where(and(eq(brands.projectId, projectId), eq(brands.active, true))).all();
    ids = active.flatMap((brand) => {
      const run = db.select().from(crawlRuns).where(eq(crawlRuns.brandId, brand.id)).orderBy(desc(crawlRuns.createdAt)).get();
      return run ? [run.id] : [];
    });
  }
  if (!ids.length) return [];
  return db.select({ id: pages.id, url: pages.url, finalUrl: pages.finalUrl, title: pages.title, status: pages.status,
    statusCode: pages.statusCode, wordCount: pages.wordCount, error: pages.error, fetchedAt: pages.fetchedAt,
    brandId: pages.brandId, crawlRunId: pages.crawlRunId }).from(pages).where(inArray(pages.crawlRunId, ids)).orderBy(desc(pages.fetchedAt)).all();
}
