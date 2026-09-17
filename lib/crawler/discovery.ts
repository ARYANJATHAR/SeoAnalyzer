import robotsParser from "robots-parser";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Discovery } from "../types";
import { InputError, isPageCandidate, normalizeUrl, sameDomain } from "../security/url";
import { ROBOT_AGENT, safeFetch } from "./http";

export async function readRobots(origin: string, signal?: AbortSignal) {
  const robotsUrl = new URL("/robots.txt", origin).toString();
  const result = await safeFetch(robotsUrl, { scope: origin, signal, kind: "text" });
  if (![200, 404, 410].includes(result.status)) throw new InputError(`robots.txt returned HTTP ${result.status}. Crawling is paused until access can be confirmed.`);
  if (result.status === 200 && (/text\/html/i.test(String(result.headers["content-type"])) || /<html[\s>]/i.test(result.body))) {
    throw new InputError("robots.txt returned a web page. Crawl permissions could not be confirmed.");
  }
  const robotsText = result.status === 200 ? result.body : "";
  return { robotsUrl, robotsStatus: result.status, robotsText, parser: robotsParser(robotsUrl, robotsText) };
}

export async function discover(origin: string, signal?: AbortSignal): Promise<Discovery> {
  const robots = await readRobots(origin, signal);
  const warnings: string[] = [];
  const policies = new Map([[new URL(origin).origin, robots]]);
  async function allowed(url: string) {
    const key = new URL(url).origin;
    let policy = policies.get(key);
    if (!policy) { policy = await readRobots(key, signal); policies.set(key, policy); }
    return policy.parser.isAllowed(url, ROBOT_AGENT) !== false;
  }
  async function delayFor(url: string) {
    await allowed(url);
    return (policies.get(new URL(url).origin)!.parser.getCrawlDelay(ROBOT_AGENT) || 0) * 1000;
  }
  const queue = [...robots.parser.getSitemaps(), new URL("/sitemap.xml", origin).toString(), new URL("/sitemap_index.xml", origin).toString()];
  const visited = new Set<string>();
  const pageUrls = new Set<string>();
  const sitemapUrls: string[] = [];
  let truncated = false;
  // DTDs are rejected below; standard XML entities still need decoding in URLs.
  const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, processEntities: true, parseTagValue: false, isArray: (name) => ["sitemap", "url"].includes(name) });
  while (queue.length && visited.size < 12 && pageUrls.size < 5000) {
    signal?.throwIfAborted();
    const candidate = queue.shift()!;
    let url: string;
    try { url = normalizeUrl(candidate, origin); } catch { warnings.push("An invalid sitemap URL was ignored."); continue; }
    if (visited.has(url)) continue;
    visited.add(url);
    if (!sameDomain(url, origin)) { warnings.push(`External sitemap skipped: ${url}`); continue; }
    try {
      const result = await safeFetch(url, { scope: origin, signal, kind: "text", allow: allowed, delayFor });
      if (result.status === 404 || result.status === 410) continue;
      if (result.status !== 200) throw new InputError(`HTTP ${result.status}`);
      if (/<!DOCTYPE|<!ENTITY/i.test(result.body) || XMLValidator.validate(result.body) !== true) throw new InputError("Invalid or unsupported sitemap XML");
      const document = parser.parse(result.body);
      if (!document.urlset && !document.sitemapindex) throw new InputError("No sitemap root element");
      sitemapUrls.push(url);
      for (const item of document.sitemapindex?.sitemap || []) {
        if (typeof item.loc === "string" && queue.length < 100) queue.push(item.loc.trim());
        else if (queue.length >= 100) truncated = true;
      }
      for (const item of document.urlset?.url || []) {
        if (typeof item.loc !== "string") continue;
        try {
          const page = normalizeUrl(item.loc.trim());
          if (sameDomain(page, origin) && isPageCandidate(page)) pageUrls.add(page);
        } catch { /* Bad sitemap entries do not invalidate the rest. */ }
        if (pageUrls.size >= 5000) { truncated = true; break; }
      }
    } catch (error) {
      signal?.throwIfAborted();
      warnings.push(`Sitemap ${url}: ${error instanceof Error ? error.message : "could not be read"}`);
    }
  }
  truncated ||= queue.length > 0;
  if (!sitemapUrls.length) warnings.push("No readable sitemap found. The crawler will discover pages through internal links.");
  if (truncated) warnings.push("Sitemap discovery reached its limit (12 files / 5,000 URLs). The selected crawl cap still applies.");
  return { origin, robotsUrl: robots.robotsUrl, robotsStatus: robots.robotsStatus, robotsText: robots.robotsText,
    rootAllowed: robots.parser.isAllowed(normalizeUrl(origin), ROBOT_AGENT) !== false,
    sitemapUrls, pageUrls: [...pageUrls], warnings, truncated, discoveredAt: new Date().toISOString() };
}
