import { randomUUID, createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../../db";
import { aiUsage, brands, companyFacts, crawlRuns, factRevisions, pages, profileJobs } from "../../db/schema";
import { getProject } from "../../db/repositories/projects";
import { getSettings, configuredKeys, redact } from "../ai/config";
import { InputError } from "../security/url";
import { factFields, factSource, normalize, potentialContradictions, sourceText } from "./facts";

export const PROMPT_VERSION = "company-facts-1.0.1";
export function profileSnapshot(projectId: string, brandId?: string) {
  const project = getProject(projectId), { db } = database();
  const sites = db.select().from(brands).where(eq(brands.projectId, projectId)).all();
  const selected = sites.find((site) => site.id === brandId) || (!brandId ? sites.find((site) => site.active && site.kind === "target") : undefined);
  if (!selected) throw new InputError("Website not found in this project.", 404);
  const facts = db.select().from(companyFacts).where(and(eq(companyFacts.projectId, projectId), eq(companyFacts.brandId, selected.id))).orderBy(desc(companyFacts.updatedAt)).all();
  const runs = db.select({ id: crawlRuns.id, createdAt: crawlRuns.createdAt, status: crawlRuns.status, pagesFetched: crawlRuns.pagesFetched }).from(crawlRuns).where(eq(crawlRuns.brandId, selected.id)).orderBy(desc(crawlRuns.createdAt)).limit(50).all();
  const jobs = db.select().from(profileJobs).where(and(eq(profileJobs.projectId, projectId), eq(profileJobs.brandId, selected.id))).orderBy(desc(profileJobs.createdAt)).limit(20).all();
  return { project, sites, selectedBrandId: selected.id, facts, runs, jobs, conflicts: potentialContradictions(facts) };
}
export type ProfileSnapshot = ReturnType<typeof profileSnapshot>;

export function usageSnapshot(projectId: string) {
  getProject(projectId); const { db } = database();
  const total = db.select({ attempts: sql<number>`count(*)`, inputTokens: sql<number | null>`sum(${aiUsage.inputTokens})`, outputTokens: sql<number | null>`sum(${aiUsage.outputTokens})`, knownCost: sql<number | null>`sum(${aiUsage.cost})`, unknownUsage: sql<number>`sum(case when ${aiUsage.inputTokens} is null or ${aiUsage.outputTokens} is null then 1 else 0 end)`, unknownCost: sql<number>`sum(case when ${aiUsage.cost} is null then 1 else 0 end)` }).from(aiUsage).where(eq(aiUsage.projectId, projectId)).get()!;
  const entries = db.select({ id: aiUsage.id, jobId: aiUsage.jobId, purpose: aiUsage.purpose, provider: aiUsage.provider, model: aiUsage.model, servedModel: aiUsage.servedModel, upstream: aiUsage.upstream, status: aiUsage.status, inputTokens: aiUsage.inputTokens, outputTokens: aiUsage.outputTokens, cost: aiUsage.cost, error: aiUsage.error, createdAt: aiUsage.createdAt, completedAt: aiUsage.completedAt }).from(aiUsage).where(eq(aiUsage.projectId, projectId)).orderBy(desc(aiUsage.createdAt)).limit(100).all();
  const settings = getSettings(projectId);
  return { total, entries, remaining: Math.max(0, settings.requestBudget - total.attempts), settings, keys: configuredKeys() };
}
export type UsageSnapshot = ReturnType<typeof usageSnapshot>;

export function extractionPreview(projectId: string, crawlId: string) {
  getProject(projectId); const { db } = database();
  const crawl = db.select().from(crawlRuns).where(and(eq(crawlRuns.id, crawlId), eq(crawlRuns.projectId, projectId))).get();
  if (!crawl) throw new InputError("Crawl not found in this project.", 404);
  if (["queued", "running"].includes(crawl.status)) throw new InputError("Wait for the crawl to stop before extracting facts.", 409);
  const settings = getSettings(projectId);
  const all = db.select().from(pages).where(and(eq(pages.crawlRunId, crawlId), eq(pages.status, "fetched"))).all().filter((page) => sourceText(page).length >= 16);
  const priority = (url: string) => { const path = new URL(url).pathname; return path === "/" ? 0 : /about|company/i.test(path) ? 1 : /product|pricing|security|integration/i.test(path) ? 2 : 3; };
  all.sort((a, b) => priority(a.finalUrl || a.url) - priority(b.finalUrl || b.url) || a.url.localeCompare(b.url));
  const sources = all.map((page) => ({ id: page.id, url: page.finalUrl || page.url, title: page.title, characters: sourceText(page).length, truncated: normalize(page.visibleText || "").length > 8000, fetchedAt: page.fetchedAt }));
  return { crawlId, brandId: crawl.brandId, crawlStatus: crawl.status, sources, suggestedIds: sources.slice(0, settings.pageLimit).map((p) => p.id), settings,
    note: "Only selected public page text and its URL are sent to the chosen provider, and to the backup if enabled. Up to 8,000 characters per page. Project notes and confirmed facts are not sent. Provider data policies apply; the two endpoints may share upstream infrastructure." };
}
export type ExtractionPreview = ReturnType<typeof extractionPreview>;

export function queueExtraction(projectId: string, input: unknown) {
  const data = z.object({ crawlId: z.string().uuid(), pageIds: z.array(z.string().uuid()).min(1).max(12), force: z.boolean().default(false) }).strict().parse(input);
  const preview = extractionPreview(projectId, data.crawlId), { db } = database();
  const pageIds = [...new Set(data.pageIds)].sort();
  if (pageIds.length > preview.settings.pageLimit || pageIds.some((id) => !preview.sources.some((source) => source.id === id))) throw new InputError("Select collected pages within the configured extraction limit.");
  const keys = configuredKeys(); if (!keys[preview.settings.primary] && !(preview.settings.fallback && (keys.nvidia || keys.openrouter))) throw new InputError("Configure a provider key in the server environment first.");
  const { model, primary, fallback, maxTokens, temperature } = preview.settings;
  const cacheKey = createHash("sha256").update(JSON.stringify({ crawlId: data.crawlId, pageIds, settings: { model, primary, fallback, maxTokens, temperature }, version: PROMPT_VERSION })).digest("hex");
  return db.transaction((tx) => {
    if (tx.select().from(profileJobs).where(and(eq(profileJobs.projectId, projectId), inArray(profileJobs.status, ["queued", "running"]))).get()) throw new InputError("An extraction is already queued or running for this project.", 409);
    const existing = tx.select().from(profileJobs).where(and(eq(profileJobs.projectId, projectId), eq(profileJobs.cacheKey, cacheKey), eq(profileJobs.status, "completed"))).get();
    if (existing && !data.force) return { job: existing, reused: true };
    const used = tx.select({ count: sql<number>`count(*)` }).from(aiUsage).where(eq(aiUsage.projectId, projectId)).get()!.count;
    if (preview.settings.requestBudget - used < pageIds.length) throw new InputError("The remaining request budget is below one request per selected page. Increase it or select fewer pages.");
    const job = tx.insert(profileJobs).values({ id: randomUUID(), projectId, brandId: preview.brandId, crawlRunId: data.crawlId, status: "queued", settings: preview.settings, pageIds, cacheKey, promptVersion: PROMPT_VERSION, force: data.force, warnings: [], createdAt: new Date().toISOString() }).returning().get()!;
    return { job, reused: false };
  }, { behavior: "immediate" });
}
export function cancelExtraction(id: string) {
  return database().db.transaction((tx) => {
    const job = tx.select().from(profileJobs).where(eq(profileJobs.id, id)).get();
    if (!job) throw new InputError("Extraction not found.", 404);
    if (["queued", "running"].includes(job.status)) tx.update(profileJobs).set({ cancelRequested: true, ...(job.status === "queued" ? { status: "cancelled" as const, completedAt: new Date().toISOString() } : {}) }).where(eq(profileJobs.id, id)).run();
    return { cancelled: true };
  }, { behavior: "immediate" });
}

export function addFact(projectId: string, input: unknown) {
  getProject(projectId); const data = factFields.extend({ pageId: z.string().uuid(), quote: z.string().trim().min(16).max(1000), reviewNote: z.string().trim().max(1000).default("") }).strict().parse(input);
  const { db } = database(); const page = db.select().from(pages).where(eq(pages.id, data.pageId)).get();
  const crawl = page ? db.select().from(crawlRuns).where(and(eq(crawlRuns.id, page.crawlRunId), eq(crawlRuns.projectId, projectId))).get() : null;
  if (!page || !crawl || page.status !== "fetched" || !normalize(page.visibleText || "").includes(normalize(data.quote))) throw new InputError("Choose a collected page from this project and a verbatim quote from its saved text.");
  const now = new Date().toISOString();
  const fact = db.insert(companyFacts).values({ id: randomUUID(), projectId, brandId: page.brandId, category: data.category, subject: redact(data.subject), attribute: redact(data.attribute), value: redact(data.value), confidence: null, sources: [factSource(page, redact(data.quote))], origin: "human", status: "confirmed", reviewNote: redact(data.reviewNote), createdAt: now, updatedAt: now, reviewedAt: now }).returning().get()!;
  return fact;
}
export function reviewFact(id: string, input: unknown) {
  const data = factFields.extend({ status: z.enum(["unreviewed", "confirmed", "rejected"]), revision: z.number().int().positive(), reviewNote: z.string().max(1000) }).strict().parse(input);
  const { db } = database();
  return db.transaction((tx) => {
    const fact = tx.select().from(companyFacts).where(eq(companyFacts.id, id)).get();
    if (!fact) throw new InputError("Fact not found.", 404);
    if (fact.revision !== data.revision) throw new InputError("This fact changed in another view. Refresh before reviewing it.", 409);
    const now = new Date().toISOString();
    tx.insert(factRevisions).values({ id: randomUUID(), factId: id, snapshot: { ...fact }, createdAt: now }).run();
    const edited = data.category !== fact.category || data.subject !== fact.subject || data.attribute !== fact.attribute || data.value !== fact.value;
    return tx.update(companyFacts).set({ category: data.category, subject: redact(data.subject), attribute: redact(data.attribute), value: redact(data.value), confidence: edited ? null : fact.confidence, status: data.status, reviewNote: redact(data.reviewNote), revision: fact.revision + 1, updatedAt: now, reviewedAt: data.status === "unreviewed" ? null : now }).where(eq(companyFacts.id, id)).returning().get()!;
  }, { behavior: "immediate" });
}
export function factHistory(id: string) {
  const { db } = database();
  if (!db.select().from(companyFacts).where(eq(companyFacts.id, id)).get()) throw new InputError("Fact not found.", 404);
  return db.select().from(factRevisions).where(eq(factRevisions.factId, id)).orderBy(asc(factRevisions.createdAt)).all();
}
