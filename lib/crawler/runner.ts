import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import robotsParser from "robots-parser";
import { database } from "../../db";
import { crawlRuns, pages, type CrawlRun } from "../../db/schema";
import { excluded, InputError, isPageCandidate, normalizeUrl, sameDomain } from "../security/url";
import { readRobots } from "./discovery";
import { extractPage } from "./extract";
import { CrawlFetchError, ROBOT_AGENT, safeFetch } from "./http";
import type { SiteSignals } from "../audit/types";

export async function runCrawl(run: CrawlRun, controller: AbortController) {
  const { db } = database();
  if (!run.workerId) throw new InputError("A worker must claim this crawl before it can run.");
  // Copy after validation so nested callbacks capture a string, not string | null.
  const workerId: string = run.workerId;
  const origin = run.discovery.origin;
  const siteSignals: SiteSignals = { version: 1, robots: [], llms: null };
  function saveSiteSignals() {
    db.update(crawlRuns).set({ siteSignals }).where(and(eq(crawlRuns.id, run.id), eq(crawlRuns.workerId, workerId), eq(crawlRuns.status, "running"))).run();
  }
  const policies = new Map<string, ReturnType<typeof robotsParser>>();
  const loadingPolicies = new Map<string, Promise<ReturnType<typeof robotsParser>>>();
  // Re-read permissions at execution, even if a preview was recently approved.
  async function policyFor(url: string) {
    const key = new URL(url).origin;
    const existing = policies.get(key);
    if (existing) return existing;
    let pending = loadingPolicies.get(key);
    if (!pending) {
      pending = readRobots(key, controller.signal).then((result) => {
        policies.set(key, result.parser);
        siteSignals.robots.push({ origin: key, url: result.robotsUrl, status: result.robotsStatus, text: result.robotsText, observedAt: new Date().toISOString() });
        saveSiteSignals();
        if (key === new URL(origin).origin) {
          db.update(crawlRuns).set({ discovery: { ...run.discovery, robotsUrl: result.robotsUrl, robotsStatus: result.robotsStatus,
            robotsText: result.robotsText, rootAllowed: result.parser.isAllowed(normalizeUrl(origin), ROBOT_AGENT) !== false } })
            .where(and(eq(crawlRuns.id, run.id), eq(crawlRuns.workerId, workerId), eq(crawlRuns.status, "running"))).run();
        }
        return result.parser;
      });
      loadingPolicies.set(key, pending);
    }
    return pending;
  }
  await policyFor(origin);
  const queued = new Set<string>();
  const finals = new Set<string>();
  const queue: string[] = [];
  const sitemap = new Set(run.discovery.pageUrls);
  let queueTruncated = false;
  function enqueue(candidate: string) {
    let url: string;
    try { url = normalizeUrl(candidate); } catch { return; }
    if (!sameDomain(url, origin) || !isPageCandidate(url) || excluded(url, run.settings.excludedPaths) || queued.has(url)) return;
    if (queued.size >= 5000) { queueTruncated = true; return; }
    queued.add(url); queue.push(url);
  }
  enqueue(origin);
  run.discovery.pageUrls.forEach(enqueue);
  db.update(crawlRuns).set({ pagesDiscovered: queued.size }).where(eq(crawlRuns.id, run.id)).run();

  async function processPage(url: string) {
    controller.signal.throwIfAborted();
    const base = {
      id: randomUUID(), crawlRunId: run.id, brandId: run.brandId, url, status: "failed" as const,
      headings: [], internalLinks: [], externalLinks: [], structuredData: [], robotsDirectives: [], redirects: [],
      inSitemap: sitemap.has(url), fetchedAt: new Date().toISOString(),
    };
    let page: typeof pages.$inferInsert = base;
    try {
      const policy = await policyFor(url);
      if (policy.isAllowed(url, ROBOT_AGENT) === false) {
        page = { ...base, status: "skipped", error: "Disallowed by robots.txt." };
      } else if (finals.has(url)) {
        page = { ...base, status: "skipped", finalUrl: url, error: "Already fetched through a redirect in this crawl." };
      } else {
        const response = await safeFetch(url, { scope: origin, signal: controller.signal,
          delayFor: async (candidate) => Math.max(250, ((await policyFor(candidate)).getCrawlDelay(ROBOT_AGENT) || 0) * 1000),
          allow: async (candidate) => !excluded(candidate, run.settings.excludedPaths) && isPageCandidate(candidate) && (await policyFor(candidate)).isAllowed(candidate, ROBOT_AGENT) !== false,
        });
        const contentType = String(response.headers["content-type"] || "");
        page = { ...base, finalUrl: response.url, redirects: response.redirects, statusCode: response.status, contentType };
        if (response.status < 200 || response.status >= 300) page.error = `HTTP ${response.status}`;
        else if (!/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(contentType)) {
          page.status = "skipped"; page.error = `Non-HTML response (${contentType || "unknown content type"}).`;
        } else if (finals.has(response.url)) {
          page.status = "skipped"; page.error = "Redirect destination was already fetched in this crawl.";
        } else {
          finals.add(response.url);
          const extracted = extractPage(response.body, response.url, origin, response.headers["x-robots-tag"]);
          page = { ...page, ...extracted, status: "fetched", error: null };
          extracted.internalLinks.forEach(enqueue);
        }
      }
    } catch (error) {
      controller.signal.throwIfAborted();
      page = { ...page, error: error instanceof Error ? error.message : "The page could not be fetched." };
      if (error instanceof CrawlFetchError) page = { ...page, redirects: error.redirects, finalUrl: error.lastUrl, statusCode: error.lastStatus };
    }
    db.transaction((tx) => {
      const current = tx.select().from(crawlRuns).where(and(eq(crawlRuns.id, run.id), eq(crawlRuns.workerId, workerId), eq(crawlRuns.status, "running"))).get();
      if (!current || current.cancelRequested) throw new InputError("Crawl cancelled or worker lease lost.");
      tx.insert(pages).values(page).run();
      tx.update(crawlRuns).set({
        pagesProcessed: sql`${crawlRuns.pagesProcessed} + 1`,
        pagesFetched: sql`${crawlRuns.pagesFetched} + ${page.status === "fetched" ? 1 : 0}`,
        pagesFailed: sql`${crawlRuns.pagesFailed} + ${page.status === "failed" ? 1 : 0}`,
        pagesSkipped: sql`${crawlRuns.pagesSkipped} + ${page.status === "skipped" ? 1 : 0}`,
        pagesDiscovered: queued.size,
      }).where(eq(crawlRuns.id, run.id)).run();
    });
  }
  let attempted = 0;
  while (queue.length && attempted < run.settings.pageLimit) {
    controller.signal.throwIfAborted();
    const batch = queue.splice(0, Math.min(3, run.settings.pageLimit - attempted));
    attempted += batch.length;
    const results = await Promise.allSettled(batch.map(processPage));
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
  if (queueTruncated) db.update(crawlRuns).set({ errorSummary: "Discovery reached 5,000 candidate URLs. Stored pages remain bounded by the selected page cap." }).where(eq(crawlRuns.id, run.id)).run();
  // Optional convention evidence is separate from the HTML page cap and cannot fail a crawl.
  const llmsUrl = new URL("/llms.txt", origin).toString();
  try {
    const result = await safeFetch(llmsUrl, { scope: origin, signal: controller.signal, kind: "text",
      allow: async (candidate) => !excluded(candidate, run.settings.excludedPaths) && (await policyFor(candidate)).isAllowed(candidate, ROBOT_AGENT) !== false,
      delayFor: async (candidate) => Math.max(250, ((await policyFor(candidate)).getCrawlDelay(ROBOT_AGENT) || 0) * 1000),
    });
    siteSignals.llms = { url: llmsUrl, finalUrl: result.url, status: result.status, contentType: String(result.headers["content-type"] || ""), text: result.body.slice(0, 100_000), truncated: result.body.length > 100_000, observedAt: new Date().toISOString() };
  } catch (error) {
    controller.signal.throwIfAborted();
    siteSignals.llms = { url: llmsUrl, status: null, text: "", truncated: false, error: error instanceof Error ? error.message : "Could not collect llms.txt", observedAt: new Date().toISOString() };
  }
  saveSiteSignals();
}
