import assert from "node:assert/strict";
import { test } from "node:test";
import type { CrawlRun, Page } from "../../db/schema";
import { evaluateAudit, auditRules } from "../../lib/audit/engine";
import { extractPage } from "../../lib/crawler/extract";

const origin = "https://example.com";
const observed = "2026-09-17T12:00:00.000Z";
function run(changes: Partial<CrawlRun> = {}): CrawlRun {
  return { id: "run", projectId: "project", brandId: "brand", status: "completed", settings: { pageLimit: 25, excludedPaths: [] },
    discovery: { origin, robotsUrl: `${origin}/robots.txt`, robotsStatus: 200, robotsText: "", rootAllowed: true, sitemapUrls: [`${origin}/sitemap.xml`], pageUrls: [origin], warnings: [], truncated: false, discoveredAt: observed },
    pagesDiscovered: 1, pagesProcessed: 1, pagesFetched: 1, pagesFailed: 0, pagesSkipped: 0, cancelRequested: false, workerId: null, heartbeatAt: null, errorSummary: null, auditError: null,
    createdAt: observed, startedAt: observed, completedAt: observed,
    siteSignals: { version: 1, robots: [{ origin, url: `${origin}/robots.txt`, status: 200, text: "", observedAt: observed }], llms: { url: `${origin}/llms.txt`, status: 404, text: "", truncated: false, observedAt: observed } }, ...changes };
}
function page(id: string, html = "<title>A useful example page</title><h1>Example</h1><p>Some content.</p>", changes: Partial<Page> = {}): Page {
  const url = `${origin}/${id}`;
  return { id, crawlRunId: "run", brandId: "brand", url, finalUrl: url, status: "fetched", statusCode: 200, contentType: "text/html", redirects: [], inSitemap: false, error: null, fetchedAt: observed, ...extractPage(html, url, origin), ...changes };
}
const findings = (pages: Page[], rule: string, crawl = run()) => evaluateAudit(crawl, pages).findings.filter((finding) => finding.ruleId === rule);

test("registry IDs are unique and every finding carries review guidance and evidence", () => {
  assert.equal(new Set(auditRules.map((rule) => rule.id)).size, auditRules.length);
  for (const finding of evaluateAudit(run(), [page("a", "<p>Plain page</p>")]).findings) {
    assert.ok(finding.ruleId && finding.explanation && finding.fix && finding.evidence.length);
    assert.ok(finding.evidence.every((entry) => entry.sourceUrl.startsWith("https://")));
  }
});
test("critical HTTP and JSON-LD failures are errors", () => {
  const missing = page("missing", "", { status: "failed", statusCode: 404, error: "HTTP 404" });
  assert.equal(findings([missing], "http-status")[0].severity, "error");
  const invalid = page("bad-schema", '<script type="application/ld+json">{"broken":}</script>');
  assert.equal(findings([invalid], "jsonld-parse")[0].severity, "error");
});
test("uncollected links are unavailable, never invented broken links", () => {
  const source = page("source", '<a href="/unknown">Unknown</a>');
  const output = evaluateAudit(run(), [source]);
  assert.equal(output.findings.some((f) => f.ruleId === "broken-internal-links"), false);
  assert.equal(output.coverage.find((c) => c.ruleId === "broken-internal-links")?.unavailable, 1);
});
test("broken links need a recorded 404/410 from the same crawl and brand", () => {
  const source = page("source", '<a href="/missing">Missing</a><a href="/timeout">Timeout</a>');
  const missing = page("missing", "", { status: "failed", statusCode: 410, error: "HTTP 410" });
  const timeout = page("timeout", "", { status: "failed", statusCode: null, error: "Timed out" });
  assert.equal(findings([source, missing, timeout], "broken-internal-links").length, 1);
  assert.equal(findings([source, { ...missing, crawlRunId: "old" }, timeout], "broken-internal-links").length, 0);
  assert.equal(findings([source, { ...missing, brandId: "competitor" }], "broken-internal-links").length, 0);
});
test("canonical aliases receive incoming links; self-links do not resolve potential orphans", () => {
  const root = page("home", '<a href="/old">Link</a>', { url: origin, finalUrl: origin });
  const target = page("target", '<a href="/new">Self</a>', { url: `${origin}/old`, finalUrl: `${origin}/new` });
  assert.equal(findings([root, target], "potential-orphan").length, 0);
  assert.equal(findings([target], "potential-orphan").length, 1);
});
test("missing Phase 2 signals remain unavailable instead of passed", () => {
  const output = evaluateAudit(run({ siteSignals: null }), [page("legacy", undefined, { technicalSignals: null })]);
  for (const rule of ["canonical-invalid", "editorial-author", "llms-presence", "robots-access"]) {
    const coverage = output.coverage.find((entry) => entry.ruleId === rule)!;
    assert.equal(coverage.unavailable, 1); assert.equal(coverage.passed, 0);
  }
});
test("deduplicated redirect aliases retain incoming edges to the fetched destination", () => {
  const source = page("home", '<a href="/alias">Alias</a>', { url: origin, finalUrl: origin });
  const target = page("destination");
  const alias = page("alias", "", { status: "skipped", finalUrl: target.url, error: "Already collected", redirects: [{ url: `${origin}/alias`, destination: target.url, status: 301 }] });
  assert.equal(findings([source, target, alias], "potential-orphan").length, 0);
});
test("timeouts cannot produce a passed broken-link check", () => {
  const source = page("source", '<a href="/timeout">Timeout</a>');
  const timeout = page("timeout", "", { status: "failed", statusCode: null, error: "Timed out" });
  const coverage = evaluateAudit(run(), [source, timeout]).coverage.find((entry) => entry.ruleId === "broken-internal-links")!;
  assert.equal(coverage.passed, 0);
  assert.equal(coverage.unavailable, 2);
});
test("robots policy findings keep the observed agent and origin", () => {
  const crawl = run();
  crawl.siteSignals!.robots[0].text = "User-agent: AnswerLensBot\nDisallow: /private\n\nUser-agent: GPTBot\nDisallow: /";
  const blocked = page("private", "", { status: "skipped", error: "Disallowed by robots.txt." });
  assert.equal(findings([blocked], "robots-access", crawl).length, 1);
  const evidence = findings([blocked], "ai-robots", crawl)[0].evidence;
  assert.ok(evidence.some((entry) => Array.isArray(entry.value) && entry.value.includes("GPTBot: disallowed")));
  assert.equal(findings([blocked], "http-status", crawl).length, 0);
});
test("noindex findings retain agent scope and canonical target evidence", () => {
  const canonical = page("canonical", '<link rel="canonical" href="/canonical"><meta name="googlebot" content="noindex">');
  assert.deepEqual(findings([canonical], "indexability")[0].evidence[0].value, ["googlebot: noindex"]);
  assert.equal(findings([canonical], "canonical-noindex").length, 1);
  const alias = page("alias", '<link rel="canonical" href="/canonical">');
  assert.equal(findings([alias, canonical], "canonical-noindex").length, 2);
  assert.equal(findings([page("index", '<meta name="robots" content="index, follow">')], "indexability").length, 0);
});
test("schema entities are discovered within graph arrays", () => {
  const root = page("home", '<script type="application/ld+json">{"@graph":[{"@type":["Thing","Organization"],"name":"Example"}]}</script>', { technicalSignals: { ...page("home").technicalSignals!, pageKind: "home" } });
  assert.equal(findings([root], "organization-schema").length, 0);
});
test("FAQ compares decoded question and answer text to HTML", () => {
  const schema = '<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is this?","acceptedAnswer":{"@type":"Answer","text":"<p>A useful &amp; simple tool.</p>"}}]}</script>';
  const matching = page("faq", `${schema}<h2>What is this?</h2><p>A useful &amp; simple tool.</p>`);
  assert.equal(findings([matching], "faq-visible-match").length, 0);
  assert.equal(findings([page("faq", schema)], "faq-visible-match").length, 1);
});
test("duplicates compare only collected pages in one crawl", () => {
  const a = page("a"), b = page("b");
  assert.equal(findings([a, b], "title-duplicate").length, 2);
  assert.equal(findings([a, b], "content-duplicate").length, 2);
  assert.equal(findings([a, { ...b, crawlRunId: "another" }], "title-duplicate").length, 0);
});
test("near duplicate threshold uses text similarity and does not repeat exact matches", () => {
  const words = Array.from({ length: 160 }, (_, index) => `word${index}`).join(" ");
  const a = page("a", `<main>${words}</main>`);
  const b = page("b", `<main>${words} plus one ending</main>`);
  assert.equal(findings([a, b], "content-near-duplicate").length, 2);
  assert.equal(findings([a, page("copy", `<main>${words}</main>`)], "content-near-duplicate").length, 0);
});
test("llms absence is an observation and truncated syntax is unavailable", () => {
  assert.equal(findings([], "llms-presence")[0].severity, "observation");
  const crawl = run(); crawl.siteSignals!.llms = { ...crawl.siteSignals!.llms!, status: 200, truncated: true };
  assert.equal(evaluateAudit(crawl, []).coverage.find((c) => c.ruleId === "llms-syntax")?.unavailable, 1);
});
test("extraction captures canonical errors, editorial signals and text without executing scripts", () => {
  const extracted = extractPage('<title>Article</title><link rel="canonical" href="javascript:alert(1)"><meta name="author" content="A Writer"><meta property="article:published_time" content="2026-09-17"><noscript>Enable JavaScript</noscript><script>alert("ignored")</script><main><h1>Useful article</h1><p>Visible evidence</p></main>', `${origin}/blog/article`, origin);
  assert.equal(extracted.technicalSignals.pageKind, "editorial");
  assert.equal(extracted.technicalSignals.canonicalCandidates[0].url, null);
  assert.deepEqual(extracted.technicalSignals.authors, ["A Writer"]);
  assert.ok(extracted.technicalSignals.javascriptNotice);
  assert.equal(extracted.visibleText.includes("ignored"), false);
  assert.ok(extracted.technicalSignals.mainText.includes("Visible evidence"));
});
