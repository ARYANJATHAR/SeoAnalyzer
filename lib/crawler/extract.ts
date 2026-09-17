import { load } from "cheerio";
import { createHash } from "node:crypto";
import type { Heading, SchemaEntry } from "../types";
import { normalizeUrl, sameDomain } from "../security/url";
import type { TechnicalSignals } from "../audit/types";
import { hasType, schemaNodes } from "../audit/helpers";

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
export function extractPage(html: string, url: string, scope: string, headerRobots?: string | string[]) {
  const $ = load(html);
  const title = clean($("title").first().text());
  const metaDescription = $("meta[name='description' i]").first().attr("content")?.trim() || "";
  const language = $("html").attr("lang") || null;
  let base = url;
  try { base = normalizeUrl($("base[href]").first().attr("href") || url, url); } catch { /* Ignore invalid base. */ }
  let canonicalUrl: string | null = null;
  try { const value = $("link[rel~='canonical' i]").first().attr("href"); if (value) canonicalUrl = normalizeUrl(value, base); } catch { /* Retain missing canonical. */ }
  const structuredData: SchemaEntry[] = [];
  $("script[type='application/ld+json' i]").each((_, element) => {
    try { structuredData.push({ valid: true, value: JSON.parse($(element).text()) }); }
    catch { structuredData.push({ valid: false, error: "Invalid JSON-LD syntax", value: $(element).text().slice(0, 5000) }); }
  });
  const nodes = schemaNodes({ structuredData });
  const values = (selector: string, attr?: string) => $(selector).toArray().map((element) => clean(attr ? $(element).attr(attr) || "" : $(element).text())).filter(Boolean);
  const dates = (property: string) => $(`[itemprop='${property}']`).toArray().map((element) => clean($(element).attr("content") || $(element).attr("datetime") || $(element).text())).filter(Boolean);
  const entityNames = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(entityNames);
    if (value && typeof value === "object" && "name" in value && typeof value.name === "string") return [value.name];
    return [];
  };
  const path = new URL(url).pathname;
  const editorial = nodes.some((node) => hasType(node, ["Article", "BlogPosting", "NewsArticle", "TechArticle"])) || /\/(blog|articles?|news)\/[^/]+/i.test(path);
  const technicalSignals: TechnicalSignals = {
    version: 1,
    pageKind: path === "/" ? "home" : editorial ? "editorial" : /\/(products?|software|solutions?)(\/|$)/i.test(path) ? "product" : /\/(faq|faqs)(\/|$)/i.test(path) ? "faq" : /\/(privacy|terms|legal)(\/|$)/i.test(path) ? "legal" : "other",
    canonicalCandidates: $("link[rel~='canonical' i]").toArray().map((element) => {
      const raw = $(element).attr("href") || "";
      try { return { raw, url: raw ? normalizeUrl(raw, base) : null }; } catch { return { raw, url: null }; }
    }),
    authors: [...new Set([...values("meta[name='author' i]", "content"), ...values("[rel~='author']"), ...nodes.flatMap((node) => entityNames(node.author))])],
    publishedDates: [...new Set([...values("meta[property='article:published_time' i]", "content"), ...dates("datePublished"), ...nodes.flatMap((node) => typeof node.datePublished === "string" ? [node.datePublished] : [])])],
    modifiedDates: [...new Set([...values("meta[property='article:modified_time' i]", "content"), ...dates("dateModified"), ...nodes.flatMap((node) => typeof node.dateModified === "string" ? [node.dateModified] : [])])],
    contactSignals: $("a[href]").toArray().flatMap((element) => { const href = $(element).attr("href") || ""; return /^(mailto:|tel:)|(?:^|\/)contact(?:[/.?#]|$)/i.test(href) ? [href.slice(0, 500)] : []; }).slice(0, 30),
    identitySignals: [...values("meta[property='og:site_name' i]", "content"), ...nodes.filter((node) => hasType(node, ["Organization", "Corporation", "LocalBusiness"])).flatMap((node) => entityNames(node)), ...$("a[href]").toArray().flatMap((element) => { const href = $(element).attr("href") || ""; return /(?:^|\/)about(?:[/.?#]|$)/i.test(href) ? [href] : []; })].slice(0, 30),
    scriptCount: $("script:not([type='application/ld+json' i])").length,
    javascriptNotice: /(?:enable|turn on|requires?)\s+javascript/i.test($("noscript").text()) ? clean($("noscript").text()).slice(0, 500) : null,
    mainText: "",
  };
  const robotsDirectives: string[] = [];
  $("meta[name='robots' i],meta[name='googlebot' i],meta[name='bingbot' i]").each((_, element) => {
    robotsDirectives.push(`${$(element).attr("name")}: ${$(element).attr("content") || ""}`);
  });
  for (const value of Array.isArray(headerRobots) ? headerRobots : headerRobots ? [headerRobots] : []) robotsDirectives.push(`X-Robots-Tag: ${value}`);
  const internal = new Set<string>();
  const external = new Set<string>();
  $("a[href]").each((_, element) => {
    if (internal.size + external.size >= 5000) return;
    try {
      const link = normalizeUrl($(element).attr("href")!, base);
      (sameDomain(link, scope) ? internal : external).add(link);
    } catch { /* Mail, telephone, script, and malformed links are not web pages. */ }
  });
  $("script,style,noscript,template,svg,[hidden],[aria-hidden='true']").remove();
  const headings: Heading[] = [];
  $("h1,h2,h3,h4,h5,h6").each((_, element) => { headings.push({ level: Number(element.tagName.slice(1)), text: clean($(element).text()) }); });
  $("br,p,div,section,article,li,td,th,h1,h2,h3,h4,h5,h6").append(" ");
  const visibleText = clean($("body").text());
  technicalSignals.mainText = clean($("main, [role='main'], article").first().text()) || visibleText;
  return { title, metaDescription, language, canonicalUrl, headings, structuredData, robotsDirectives,
    technicalSignals,
    internalLinks: [...internal], externalLinks: [...external], visibleText,
    textHash: createHash("sha256").update(visibleText).digest("hex"), wordCount: visibleText ? visibleText.split(/\s+/u).length : 0 };
}
