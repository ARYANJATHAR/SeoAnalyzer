import robotsParser from "robots-parser";
import type { CrawlRun, Page } from "../../db/schema";
import type { AuditOutput, Evidence, Finding, RuleCoverage, Severity } from "./types";
import { comparable, hasType, htmlText, noindexDirectives, pageUrl, schemaHas, schemaNodes, shingles, similarity, urlKey } from "./helpers";

export const RULE_VERSION = "technical-1.0.0";
type Result = Evidence[] | null | "unavailable" | "not_applicable";
type Context = { run: CrawlRun; pages: Page[]; html: Page[]; byUrl: Map<string, Page>; incoming: Map<string, Set<string>>; near: Map<string, { page: Page; score: number }[]>; nearEligible: Set<string> };
type Rule = {
  id: string; title: string; category: string; severity: Severity; explanation: string; fix: string;
  scope: "page" | "html" | "signals" | "site";
  check: (page: Page, context: Context) => Result;
};
const ev = (page: Page, label: string, value: Evidence["value"]): Evidence => ({ label, value, sourceUrl: pageUrl(page), pageId: page.id, observedAt: page.fetchedAt });
const siteEv = (url: string, label: string, value: Evidence["value"]): Evidence => ({ label, value, sourceUrl: url });
const duplicates = (page: Page, context: Context, field: "title" | "metaDescription" | "textHash") => context.html.filter((other) => other.id !== page.id && !!page[field] && comparable(other[field] || "") === comparable(page[field] || ""));
const optionalSchema = (type: string[], relevant: boolean, page: Page): Result => !relevant ? "not_applicable" : schemaHas(page, type) ? null : [ev(page, "Expected type for manual review", type), ev(page, "Page kind (heuristic)", page.technicalSignals?.pageKind || "unknown")];

export const auditRules: Rule[] = [
  { id: "http-status", title: "Page could not be collected", category: "Access", severity: "error", scope: "page",
    explanation: "The crawler recorded an HTTP error or a failed request. A failed request is evidence of this attempt only, not proof of permanent unavailability.", fix: "Inspect the response and redirect path. Repair confirmed errors, or retry transient failures after checking server access.",
    check: (p) => p.status === "failed" ? [ev(p, "HTTP status", p.statusCode ?? "No response"), ev(p, "Request failure", p.error || "Unknown failure")] : null },
  { id: "redirect-chain", title: "Multiple redirect hops", category: "Access", severity: "warning", scope: "page",
    explanation: "This request followed at least two redirects. Extra hops add requests and can hide stale internal destinations.", fix: "Point internal links at the intended final URL and consolidate redirects where possible.",
    check: (p) => p.redirects.length > 1 ? [ev(p, "Recorded redirects", p.redirects.map((r) => `${r.status} ${r.url} → ${r.destination}`))] : null },
  { id: "https", title: "Page served over HTTP", category: "Access", severity: "warning", scope: "html",
    explanation: "The final collected HTML URL uses unencrypted HTTP.", fix: "Serve this page over HTTPS and redirect HTTP requests to its HTTPS URL.", check: (p) => new URL(pageUrl(p)).protocol !== "https:" ? [ev(p, "Final URL", pageUrl(p))] : null },
  { id: "canonical-missing", title: "No usable canonical link", category: "Indexability", severity: "warning", scope: "html",
    explanation: "No usable HTML canonical link was extracted. A missing link alone does not prove an indexing problem; HTTP Link headers are not evaluated.", fix: "Review canonical intent. Where appropriate, add a single absolute canonical link to the preferred indexable URL.", check: (p) => !p.canonicalUrl ? [ev(p, "HTML canonical", "Not extracted")] : null },
  { id: "canonical-invalid", title: "Ambiguous or invalid canonical links", category: "Indexability", severity: "warning", scope: "signals",
    explanation: "Multiple canonical elements or an invalid/empty href were found in the HTML.", fix: "Use one valid canonical link, with a destination that matches the intended preferred page.", check: (p) => p.technicalSignals!.canonicalCandidates.length > 1 || p.technicalSignals!.canonicalCandidates.some((c) => !c.url) ? [ev(p, "Canonical hrefs", p.technicalSignals!.canonicalCandidates.map((c) => c.raw || "(empty)"))] : null },
  { id: "canonical-mismatch", title: "Canonical points to another URL", category: "Indexability", severity: "observation", scope: "html",
    explanation: "The declared canonical differs from the collected URL. This can be intentional consolidation; it is not automatically an error.", fix: "Confirm this alternate URL should consolidate to the declared destination and that the destination is accessible.", check: (p) => p.canonicalUrl && urlKey(p.canonicalUrl) !== urlKey(pageUrl(p)) ? [ev(p, "Final URL", pageUrl(p)), ev(p, "Declared canonical", p.canonicalUrl)] : null },
  { id: "indexability", title: "Indexing restriction declared", category: "Indexability", severity: "observation", scope: "html",
    explanation: "A captured robots directive includes noindex or none. The exact directive and its agent scope are shown; this does not describe every crawler or the page's actual index status.", fix: "Keep deliberate restrictions. If the page should be indexed by the named agent, review the relevant meta tag or response header.", check: (p) => noindexDirectives(p).length ? [ev(p, "Scoped directives", noindexDirectives(p))] : null },
  { id: "canonical-noindex", title: "Canonical and noindex need review", category: "Indexability", severity: "warning", scope: "html",
    explanation: "A self-canonical page declares noindex, or its recorded canonical target declares noindex. These signals need an intent review; agent-specific restrictions remain agent-specific.", fix: "Align canonical and indexing directives with the intended indexable destination. Do not remove intentional restrictions indiscriminately.",
    check: (p, c) => {
      if (!p.canonicalUrl) return "not_applicable";
      const target = urlKey(p.canonicalUrl) === urlKey(pageUrl(p)) ? p : c.byUrl.get(urlKey(p.canonicalUrl));
      if (!target || target.status !== "fetched") return "unavailable";
      return noindexDirectives(target).length ? [ev(p, "Canonical destination", p.canonicalUrl), ev(target, "Destination restrictions", noindexDirectives(target))] : null;
    } },
  { id: "robots-access", title: "Crawl access restricted", category: "Access", severity: "observation", scope: "page",
    explanation: "The saved robots policy disallows this URL for AnswerLensBot. This is independent of search-engine indexing directives.", fix: "Confirm the restriction is intentional. Change robots.txt only for paths and agents you want to permit.",
    check: (p, c) => {
      const policy = c.run.siteSignals?.robots.find((r) => r.origin === new URL(p.url).origin);
      if (!policy) return "unavailable";
      return robotsParser(policy.url, policy.text).isAllowed(p.url, "AnswerLensBot") === false ? [siteEv(policy.url, "Recorded robots.txt", policy.text.slice(0, 12000)), ev(p, "Agent / path", `AnswerLensBot · ${p.url}`)] : null;
    } },
  { id: "sitemap-inclusion", title: "Page absent from discovered sitemap URLs", category: "Discovery", severity: "observation", scope: "html",
    explanation: "This page was not in the bounded sitemap discovery snapshot. Discovery can be incomplete and sitemap inclusion is optional.", fix: "If this is an important canonical page, review sitemap inclusion and whether the relevant sitemap was discovered.",
    check: (p, c) => !c.run.discovery.sitemapUrls.length ? "unavailable" : !p.inSitemap && !c.run.discovery.pageUrls.some((url) => urlKey(url) === urlKey(pageUrl(p))) ? [ev(p, "In discovered sitemap set", "No"), siteEv(c.run.discovery.origin, "Readable sitemap files", c.run.discovery.sitemapUrls)] : null },
  { id: "title-missing", title: "Missing page title", category: "Content", severity: "warning", scope: "html", explanation: "The collected HTML has no non-empty title element.", fix: "Add a concise, descriptive title that distinguishes this page.", check: (p) => !p.title?.trim() ? [ev(p, "Title", "Empty or absent")] : null },
  { id: "title-duplicate", title: "Repeated page title", category: "Content", severity: "warning", scope: "html", explanation: "The normalized title matches another collected page in this same crawl. URL variants may legitimately share titles.", fix: "Review canonical intent; give distinct pages distinct descriptive titles.", check: (p, c) => { const matches = duplicates(p, c, "title"); return matches.length ? [ev(p, "Title", p.title!), ev(p, "Matching collected URLs", matches.map(pageUrl))] : null; } },
  { id: "title-length", title: "Title length needs review", category: "Content", severity: "observation", scope: "html", explanation: "The title falls outside this tool's 15–65 character review band. This is a local heuristic, not a search-engine limit or ranking threshold.", fix: "Check that the title communicates the page purpose clearly; do not change a useful title solely to meet a count.", check: (p) => p.title && (p.title.length < 15 || p.title.length > 65) ? [ev(p, "Title", p.title), ev(p, "Characters", p.title.length)] : null },
  { id: "description-missing", title: "Missing meta description", category: "Content", severity: "warning", scope: "html", explanation: "No non-empty description meta tag was extracted from the HTML.", fix: "Add a useful page-specific summary where a description helps explain the page.", check: (p) => !p.metaDescription?.trim() ? [ev(p, "Meta description", "Empty or absent")] : null },
  { id: "description-duplicate", title: "Repeated meta description", category: "Content", severity: "warning", scope: "html", explanation: "The normalized description matches another collected page in this crawl.", fix: "Differentiate descriptions for pages with distinct purposes; review duplicate URL variants separately.", check: (p, c) => { const matches = duplicates(p, c, "metaDescription"); return matches.length ? [ev(p, "Description", p.metaDescription!), ev(p, "Matching collected URLs", matches.map(pageUrl))] : null; } },
  { id: "h1-count", title: "Primary heading needs review", category: "Content", severity: "observation", scope: "html", explanation: "The HTML contains zero or multiple H1 elements. This is a document-structure review, not a claim that multiple H1s incur a ranking penalty.", fix: "Use a clear heading hierarchy with an identifiable primary page heading.", check: (p) => { const h1 = p.headings.filter((h) => h.level === 1); return h1.length !== 1 ? [ev(p, "H1 count", h1.length), ev(p, "H1 text", h1.map((h) => h.text))] : null; } },
  { id: "heading-order", title: "Heading levels are skipped", category: "Content", severity: "observation", scope: "html", explanation: "A heading descends by more than one level compared with the preceding heading.", fix: "Review heading order for readable document structure and assistive navigation.", check: (p) => { const jumps = p.headings.filter((h, i) => i > 0 && h.level > p.headings[i - 1].level + 1); return jumps.length ? [ev(p, "Skipped-level headings", jumps.map((h) => `H${h.level}: ${h.text}`))] : null; } },
  { id: "word-count", title: "Limited text in collected HTML", category: "Content", severity: "observation", scope: "html", explanation: "Fewer than 100 whitespace-separated words were extracted. This heuristic is language-dependent and says nothing by itself about quality or rankings.", fix: "Review whether this page provides the information visitors need and whether important content is available in server HTML.", check: (p) => (p.wordCount ?? 0) < 100 ? [ev(p, "Extracted words", p.wordCount ?? 0)] : null },
  { id: "internal-links", title: "No internal links extracted", category: "Links", severity: "observation", scope: "html", explanation: "No same-domain HTTP links were extracted from anchor elements on this page.", fix: "If appropriate, provide crawlable anchor links to relevant pages. Script-driven navigation is not evaluated.", check: (p) => !p.internalLinks.length ? [ev(p, "Internal anchor URLs", 0)] : null },
  { id: "potential-orphan", title: "No incoming link in collected graph", category: "Links", severity: "observation", scope: "html", explanation: "No other collected HTML page links to this non-homepage URL or its requested alias. This is a potential orphan within a partial graph, not proof of a site-wide orphan.", fix: "Review navigation and relevant contextual links. A larger crawl may reveal incoming links outside this sample.", check: (p, c) => new URL(pageUrl(p)).pathname === "/" ? "not_applicable" : !c.incoming.get(p.id)?.size ? [ev(p, "Incoming links from other collected pages", 0), ev(p, "HTML pages in graph", c.html.length)] : null },
  { id: "broken-internal-links", title: "Internal links returned 404 or 410", category: "Links", severity: "error", scope: "html", explanation: "Linked internal destinations returned HTTP 404 or 410 in this crawl. Unvisited links, robots blocks, timeouts, and other HTTP errors are not labeled broken. Other destinations may remain unevaluated even when a confirmed broken link is reported.", fix: "Repair the source links, restore the missing destination, or point them to an appropriate replacement.", check: (p, c) => {
    const broken = p.internalLinks.flatMap((url) => { const target = c.byUrl.get(urlKey(url)); return target && [404, 410].includes(target.statusCode || 0) ? [ev(target, `Linked from ${pageUrl(p)}`, `${target.statusCode} ${url}`)] : []; });
    const unknown = p.internalLinks.some((url) => { const target = c.byUrl.get(urlKey(url)); return !target || target.statusCode === null || target.statusCode < 200 || target.statusCode >= 300; });
    return broken.length ? broken : unknown ? "unavailable" : !p.internalLinks.length ? "not_applicable" : null;
  } },
  { id: "jsonld-missing", title: "No JSON-LD extracted", category: "Structured data", severity: "observation", scope: "html", explanation: "No JSON-LD script blocks were extracted. JSON-LD is optional; microdata and RDFa are outside this check.", fix: "Consider accurate schema where it describes visible content and helps explain the page's entities.", check: (p) => !p.structuredData.length ? [ev(p, "JSON-LD blocks", 0)] : null },
  { id: "jsonld-parse", title: "JSON-LD syntax error", category: "Structured data", severity: "error", scope: "html", explanation: "At least one JSON-LD script could not be parsed as JSON. Valid JSON does not imply valid schema semantics.", fix: "Correct the JSON syntax and validate the resulting structured data against its intended schema.", check: (p) => { const invalid = p.structuredData.filter((s) => !s.valid); return invalid.length ? invalid.map((s) => ev(p, s.error || "Invalid JSON", typeof s.value === "string" ? s.value.slice(0, 1000) : "Unparseable block")) : null; } },
  { id: "organization-schema", title: "Organization schema opportunity", category: "Structured data", severity: "observation", scope: "signals", explanation: "No Organization, Corporation, or LocalBusiness JSON-LD type was found on the homepage. This is optional, not a compliance failure.", fix: "If appropriate, describe the real organization with consistent name, URL, and identity details.", check: (p) => optionalSchema(["Organization", "Corporation", "LocalBusiness"], p.technicalSignals!.pageKind === "home", p) },
  { id: "product-schema", title: "Product schema opportunity", category: "Structured data", severity: "observation", scope: "signals", explanation: "A product-like path was identified without Product, SoftwareApplication, or WebApplication JSON-LD. Path-based relevance is a heuristic.", fix: "Confirm the page represents a product, then consider accurate applicable schema. Do not invent ratings, offers, or other properties.", check: (p) => optionalSchema(["Product", "SoftwareApplication", "WebApplication"], p.technicalSignals!.pageKind === "product", p) },
  { id: "faq-schema", title: "FAQ schema opportunity", category: "Structured data", severity: "observation", scope: "signals", explanation: "An FAQ-like URL has no FAQPage JSON-LD. This optional observation makes no claim about search features or AI visibility.", fix: "If FAQPage is appropriate, include only questions and answers that are actually present for visitors.", check: (p) => optionalSchema(["FAQPage"], p.technicalSignals!.pageKind === "faq", p) },
  { id: "faq-visible-match", title: "FAQ claims not matched to HTML text", category: "Structured data", severity: "warning", scope: "html", explanation: "An FAQ question or accepted answer was not matched as normalized text in the collected HTML. JavaScript content and referenced entities may require manual review.", fix: "Align FAQ markup with visitor-visible questions and answers; inspect rendering before removing legitimate content.", check: (p) => {
    const nodes = schemaNodes(p); const faqs = nodes.filter((node) => hasType(node, ["FAQPage"]));
    if (!faqs.length) return "not_applicable";
    const resolve = (value: unknown): Record<string, unknown> | null => { if (!value || typeof value !== "object") return null; const n = value as Record<string, unknown>; return Object.keys(n).length === 1 && typeof n["@id"] === "string" ? nodes.find((other) => other["@id"] === n["@id"] && Object.keys(other).length > 1) || null : n; };
    const missing: string[] = []; let compared = 0;
    for (const faq of faqs) for (const raw of Array.isArray(faq.mainEntity) ? faq.mainEntity : [faq.mainEntity]) {
      const question = resolve(raw); const answerValue = question?.acceptedAnswer;
      const answers = Array.isArray(answerValue) ? answerValue : [answerValue];
      const texts = [htmlText(question?.name), ...answers.map((answer) => htmlText(resolve(answer)?.text))];
      for (const text of texts) { if (!text) { missing.push("Question or accepted answer missing/unresolved"); continue; } compared++; if (!comparable(p.visibleText || "").includes(comparable(text))) missing.push(text.slice(0, 600)); }
    }
    return missing.length ? [ev(p, "Unmatched FAQ content", missing)] : compared ? null : "unavailable";
  } },
  { id: "breadcrumb-schema", title: "Breadcrumb schema opportunity", category: "Structured data", severity: "observation", scope: "html", explanation: "A URL at least two path segments deep has no BreadcrumbList JSON-LD. URL depth is only a relevance heuristic.", fix: "For pages within a real hierarchy, consider breadcrumbs that reflect navigation accurately.", check: (p) => optionalSchema(["BreadcrumbList"], new URL(pageUrl(p)).pathname.split("/").filter(Boolean).length >= 2, p) },
  { id: "editorial-author", title: "Editorial author not extracted", category: "Trust signals", severity: "observation", scope: "signals", explanation: "This article-like page has no author in captured author metadata, rel=author links, or JSON-LD. Plain-text bylines may not be recognized.", fix: "Review the visible byline and identify the responsible author or organization where relevant.", check: (p) => p.technicalSignals!.pageKind !== "editorial" ? "not_applicable" : !p.technicalSignals!.authors.length ? [ev(p, "Captured authors", "None"), ev(p, "Page kind (heuristic)", "editorial")] : null },
  { id: "editorial-dates", title: "Editorial dates need review", category: "Trust signals", severity: "observation", scope: "signals", explanation: "An article-like page has no captured publication date, or a captured publication/modification date is unparseable or inconsistent. Do not imply an update that did not occur.", fix: "Provide honest publication dates and modification dates when meaningful, using machine-readable metadata consistent with the visible page.", check: (p) => {
    const s = p.technicalSignals!; if (s.pageKind !== "editorial") return "not_applicable";
    const all = [...s.publishedDates, ...s.modifiedDates];
    return !s.publishedDates.length || all.some((d) => !Number.isFinite(Date.parse(d))) || (s.publishedDates[0] && s.modifiedDates[0] && Date.parse(s.modifiedDates[0]) < Date.parse(s.publishedDates[0])) ? [ev(p, "Publication dates", s.publishedDates), ev(p, "Modification dates", s.modifiedDates)] : null;
  } },
  { id: "javascript-content", title: "Possible JavaScript-dependent content", category: "Content", severity: "observation", scope: "signals", explanation: "The page has fewer than 100 extracted words and scripts or a JavaScript notice. No browser rendering was performed, so JavaScript dependence is unconfirmed.", fix: "Inspect the rendered page and server response. Consider server rendering important content and links if they are absent from HTML.", check: (p) => (p.wordCount || 0) < 100 && (p.technicalSignals!.scriptCount > 0 || p.technicalSignals!.javascriptNotice) ? [ev(p, "Words in HTML", p.wordCount || 0), ev(p, "Non-JSON-LD scripts", p.technicalSignals!.scriptCount), ev(p, "Noscript notice", p.technicalSignals!.javascriptNotice || "None")] : null },
  { id: "content-duplicate", title: "Identical extracted content", category: "Content", severity: "observation", scope: "html", explanation: "The extracted non-empty HTML text has the same hash as another page in this crawl. This does not establish a duplicate-content penalty.", fix: "Review URL variants and canonical intent; consolidate truly redundant pages where appropriate.", check: (p, c) => { const matches = p.visibleText?.trim() ? duplicates(p, c, "textHash") : []; return matches.length ? [ev(p, "Text hash", p.textHash!), ev(p, "Matching URLs", matches.map(pageUrl))] : null; } },
  { id: "content-near-duplicate", title: "Similar extracted content", category: "Content", severity: "observation", scope: "html", explanation: "Five-word shingle overlap is at least 85% for texts of at least 100 words, using up to 5,000 words of main text (or body fallback). Shared templates can inflate similarity; exact hash matches are handled separately.", fix: "Compare the pages' intended purposes and unique content before consolidating or changing them.", check: (p, c) => { const matches = c.near.get(p.id) || []; return matches.length ? [ev(p, "Similar collected pages", matches.map((m) => `${Math.round(m.score * 100)}% · ${pageUrl(m.page)}`))] : !c.nearEligible.has(p.id) ? "not_applicable" : null; } },
  { id: "company-identity", title: "Company identity signals not extracted", category: "Trust signals", severity: "observation", scope: "site", explanation: "No site name metadata, organization name in selected JSON-LD types, or about link was extracted from collected pages. This is a bounded heuristic, not a judgment of legitimacy.", fix: "Make the company identity clear to visitors and review the about page and organization details.", check: (_p, c) => { const known = c.html.filter((p) => p.technicalSignals); return !known.length ? "unavailable" : known.some((p) => p.technicalSignals!.identitySignals.length) ? null : [siteEv(c.run.discovery.origin, "Pages examined for identity signals", known.length)]; } },
  { id: "contact-information", title: "Contact signals not extracted", category: "Trust signals", severity: "observation", scope: "site", explanation: "No contact-path, mailto, or telephone link was extracted from this sample. Plain-text contact information and uncollected pages may exist.", fix: "Review whether visitors can find relevant contact information and link to it clearly.", check: (_p, c) => { const known = c.html.filter((p) => p.technicalSignals); return !known.length ? "unavailable" : known.some((p) => p.technicalSignals!.contactSignals.length) ? null : [siteEv(c.run.discovery.origin, "Pages examined for contact links", known.length)]; } },
  { id: "llms-presence", title: "llms.txt observation", category: "AI conventions", severity: "observation", scope: "site", explanation: "llms.txt is an emerging convention. Presence, absence, or formatting does not establish provider usage, compliance, or a ranking benefit.", fix: "Review the saved response if you choose to maintain llms.txt. Keep its description and links accurate; it is optional.", check: (_p, c) => { const value = c.run.siteSignals?.llms; return !value ? "unavailable" : [siteEv(value.url, "HTTP status", value.status ?? "No response"), siteEv(value.url, "Collected at", value.observedAt), siteEv(value.url, "Request outcome", value.error || (value.status === 200 ? "Response collected; provider usage unknown" : "No successful llms.txt response"))]; } },
  { id: "llms-syntax", title: "llms.txt format needs review", category: "AI conventions", severity: "observation", scope: "site", explanation: "The successful llms.txt response looks like HTML, is empty, or lacks a Markdown H1/link. These are simple format observations, not a specification conformance test.", fix: "If maintaining this file, review its current convention and serve descriptive Markdown with relevant links.", check: (_p, c) => { const value = c.run.siteSignals?.llms; if (!value || value.error) return "unavailable"; if (value.status !== 200) return "not_applicable"; if (value.truncated) return "unavailable"; const reasons = [!value.text.trim() && "Empty body", /<(!doctype\s+html|html|body)\b/i.test(value.text) && "HTML response", !/^#\s+\S/m.test(value.text) && "No Markdown H1", !/\[[^\]]+\]\([^)]+\)/.test(value.text) && "No Markdown link"].filter((v): v is string => !!v); return reasons.length ? [siteEv(value.url, "Format observations", reasons), siteEv(value.url, "Response excerpt", value.text.slice(0, 800))] : null; } },
  { id: "ai-robots", title: "AI-related robots policy snapshot", category: "AI conventions", severity: "observation", scope: "site", explanation: "Saved robots policies are evaluated for named agent tokens at the homepage path only. These agents have different purposes; permissions do not prove actual crawling, training, citation, or visibility.", fix: "Review the exact policies against your intended access. Consult each provider's current agent documentation before changing rules.", check: (_p, c) => !c.run.siteSignals?.robots.length ? "unavailable" : c.run.siteSignals.robots.flatMap((r) => [siteEv(r.url, "Recorded at", r.observedAt), siteEv(r.url, "Homepage access by token", ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"].map((agent) => `${agent}: ${robotsParser(r.url, r.text).isAllowed(`${r.origin}/`, agent) === false ? "disallowed" : "not disallowed"}`)), siteEv(r.url, "Robots excerpt (up to 12,000 characters)", r.text.slice(0, 12000) || `(HTTP ${r.status}; no policy body)`)] ) },
];

export function evaluateAudit(run: CrawlRun, input: Page[]): AuditOutput {
  // Never compare competitors, historical runs, or unrelated snapshots together.
  const pages = input.filter((p) => p.crawlRunId === run.id && p.brandId === run.brandId);
  const html = pages.filter((p) => p.status === "fetched");
  const byUrl = new Map<string, Page>();
  for (const p of [...pages].sort((a, b) => Number(a.status === "fetched") - Number(b.status === "fetched"))) {
    byUrl.set(urlKey(p.url), p); if (p.finalUrl) byUrl.set(urlKey(p.finalUrl), p);
  }
  for (const p of pages) {
    const final = p.finalUrl ? byUrl.get(urlKey(p.finalUrl)) : undefined;
    // Deduplicated redirect aliases still represent an incoming edge to the fetched page.
    const target = p.status === "skipped" && final?.status === "fetched" ? final : p;
    if (target !== p) byUrl.set(urlKey(p.url), target);
    for (const redirect of p.redirects) if (!byUrl.has(urlKey(redirect.url))) byUrl.set(urlKey(redirect.url), target);
  }
  const incoming = new Map<string, Set<string>>();
  for (const p of html) for (const link of p.internalLinks) { const target = byUrl.get(urlKey(link)); if (target && target.id !== p.id) { const links = incoming.get(target.id) || new Set<string>(); links.add(p.id); incoming.set(target.id, links); } }
  const near: Context["near"] = new Map();
  const samples = html.map((page) => ({ page, words: shingles(page.technicalSignals?.mainText || page.visibleText || "") }));
  for (let i = 0; i < samples.length; i++) for (let j = i + 1; j < samples.length; j++) {
    const a = samples[i], b = samples[j];
    if (!a.words || !b.words || (a.page.textHash && a.page.textHash === b.page.textHash)) continue;
    if (Math.min(a.words.size, b.words.size) / Math.max(a.words.size, b.words.size) < 0.85) continue;
    const score = similarity(a.words, b.words);
    if (score >= 0.85) { near.set(a.page.id, [...(near.get(a.page.id) || []), { page: b.page, score }]); near.set(b.page.id, [...(near.get(b.page.id) || []), { page: a.page, score }]); }
  }
  const context: Context = { run, pages, html, byUrl, incoming, near, nearEligible: new Set(samples.filter((sample) => sample.words).map((sample) => sample.page.id)) };
  const findings: Finding[] = [], coverage: RuleCoverage[] = [];
  for (const rule of auditRules) {
    const count: RuleCoverage = { ruleId: rule.id, title: rule.title, category: rule.category, severity: rule.severity, evaluated: 0, passed: 0, findings: 0, notApplicable: 0, unavailable: 0 };
    const candidates: (Page | null)[] = rule.scope === "site" ? [null] : pages;
    for (const page of candidates) {
      let result: Result;
      if (page && rule.scope !== "page" && page.status !== "fetched") result = "unavailable";
      else if (page && rule.scope === "signals" && !page.technicalSignals) result = "unavailable";
      // Site rules never access their page parameter.
      else result = rule.check(page as Page, context);
      if (result === "unavailable") { count.unavailable++; continue; }
      if (result === "not_applicable") { count.notApplicable++; continue; }
      count.evaluated++;
      if (!result?.length) { count.passed++; continue; }
      count.findings++;
      findings.push({ ruleId: rule.id, title: rule.title, category: rule.category, severity: rule.severity, explanation: rule.explanation, fix: rule.fix, pageId: page?.id || null, url: page ? pageUrl(page) : run.discovery.origin, evidence: result });
    }
    coverage.push(count);
  }
  const warnings = ["Checks use a bounded server-HTML snapshot. No JavaScript rendering, live indexing verification, or AI visibility measurement was performed.", "No finding means only that this specific check found nothing in available evidence; it is not a site-wide health score.", ...run.discovery.warnings];
  if (run.status !== "completed") warnings.push(`Crawl status is ${run.status}; results describe partial evidence.`);
  if (run.pagesProcessed < run.pagesDiscovered || run.discovery.truncated) warnings.push("Discovery or the page cap left candidate URLs uncollected. Link and duplicate checks cover collected pages only.");
  if (html.some((p) => !p.technicalSignals) || !run.siteSignals) warnings.push("Some Phase 2 signals were not collected, either because this is an older snapshot or collection stopped early. Unavailable checks need a new crawl; re-auditing does not fetch new evidence.");
  if (run.siteSignals?.llms?.truncated) warnings.push("The llms.txt body was truncated at 100,000 characters; format checks are unavailable.");
  return { findings, coverage, warnings: [...new Set(warnings)], pagesAnalyzed: html.length };
}
