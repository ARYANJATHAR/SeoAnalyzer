import { randomUUID } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { database } from "../../db";
import { brands, crawlRuns, previews } from "../../db/schema";
import { getProject } from "../../db/repositories/projects";
import { InputError } from "../security/url";
import { discover } from "./discovery";

export async function createPreview(projectId: string, brandId: string) {
  const { db } = database();
  const project = getProject(projectId);
  const brand = db.select().from(brands).where(and(eq(brands.id, brandId), eq(brands.projectId, projectId), eq(brands.active, true))).get();
  if (!brand) throw new InputError("Tracked website not found.", 404);
  const discovery = await discover(brand.domain, AbortSignal.timeout(90_000));
  const createdAt = new Date().toISOString();
  const preview = { id: randomUUID(), projectId, brandId, discovery,
    settings: { pageLimit: project.pageLimit, excludedPaths: project.excludedPaths },
    createdAt, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  db.delete(previews).where(lt(previews.expiresAt, createdAt)).run();
  db.insert(previews).values(preview).run();
  return { ...preview, discovery: { ...discovery, robotsText: "", pageUrls: discovery.pageUrls.slice(0, 20) }, discoveredCount: discovery.pageUrls.length };
}

export function queueCrawl(projectId: string, previewId: string) {
  const { db } = database();
  return db.transaction((tx) => {
    const preview = tx.select().from(previews).where(and(eq(previews.id, previewId), eq(previews.projectId, projectId))).get();
    if (!preview || preview.expiresAt < new Date().toISOString()) throw new InputError("Crawl preview expired. Discover the website again.", 409);
    const brand = tx.select().from(brands).where(and(eq(brands.id, preview.brandId), eq(brands.active, true))).get();
    if (!brand) throw new InputError("This website is no longer tracked.", 409);
    const project = getProject(projectId);
    if (preview.discovery.origin !== brand.domain || preview.settings.pageLimit !== project.pageLimit || JSON.stringify(preview.settings.excludedPaths) !== JSON.stringify(project.excludedPaths)) {
      throw new InputError("Project settings changed. Refresh the crawl preview.", 409);
    }
    if (!preview.discovery.rootAllowed && !preview.discovery.pageUrls.length) throw new InputError("robots.txt blocks the homepage and no sitemap pages were discovered.");
    if (tx.select().from(crawlRuns).where(and(eq(crawlRuns.brandId, brand.id), inArray(crawlRuns.status, ["queued", "running"]))).get()) {
      throw new InputError("This website already has a queued or active crawl.", 409);
    }
    const run = { id: randomUUID(), projectId, brandId: brand.id, status: "queued" as const,
      settings: preview.settings, discovery: preview.discovery, pagesDiscovered: preview.discovery.pageUrls.length,
      createdAt: new Date().toISOString() };
    tx.insert(crawlRuns).values(run).run();
    tx.delete(previews).where(eq(previews.id, previewId)).run();
    return run;
  });
}

export function cancelCrawl(runId: string) {
  const { db } = database();
  db.transaction((tx) => {
    const run = tx.select().from(crawlRuns).where(eq(crawlRuns.id, runId)).get();
    if (!run) throw new InputError("Crawl not found.", 404);
    if (!["queued", "running"].includes(run.status)) return;
    tx.update(crawlRuns).set(run.status === "queued" ? { cancelRequested: true, status: "cancelled", completedAt: new Date().toISOString() } : { cancelRequested: true }).where(eq(crawlRuns.id, runId)).run();
  });
}
