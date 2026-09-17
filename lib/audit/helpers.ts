import { load } from "cheerio";
import type { Page } from "../../db/schema";
import { normalizeUrl } from "../security/url";

export const compact = (value: string) => value.replace(/\s+/gu, " ").trim();
export const comparable = (value: string) => compact(value).toLowerCase();
export const pageUrl = (page: Page) => page.finalUrl || page.url;
export function urlKey(value: string) { try { return normalizeUrl(value); } catch { return value; } }

// Walk nested entities and @graph as well as top-level arrays, without trusting schema claims.
export function schemaNodes(page: Pick<Page, "structuredData">): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const pending: unknown[] = page.structuredData.filter((entry) => entry.valid).map((entry) => entry.value);
  let visited = 0;
  while (pending.length && visited++ < 10000 && result.length < 5000) {
    const node = pending.pop();
    if (Array.isArray(node)) { for (const item of node) { if (pending.length >= 10000) break; pending.push(item); } }
    else if (node && typeof node === "object") {
      const record = node as Record<string, unknown>;
      result.push(record);
      for (const value of Object.values(record)) { if (pending.length >= 10000) break; if (value && typeof value === "object") pending.push(value); }
    }
  }
  return result;
}
export function hasType(node: Record<string, unknown>, types: string[]) {
  const values = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  return values.some((value) => typeof value === "string" && types.includes(value.replace(/^https?:\/\/schema.org\//, "")));
}
export const schemaHas = (page: Page, types: string[]) => schemaNodes(page).some((node) => hasType(node, types));
export function noindexDirectives(page: Page) {
  return page.robotsDirectives.filter((value) => /(?:^|[\s,:])(noindex|none)(?=$|[\s,;])/i.test(value));
}
export function htmlText(value: unknown) { return typeof value === "string" ? compact(load(value).text()) : ""; }

// Five-word shingles, capped before comparison. This is a text heuristic, not semantic similarity.
export function shingles(text: string) {
  const words = comparable(text).match(/[\p{L}\p{N}]+/gu)?.slice(0, 5000) || [];
  if (words.length < 100) return null;
  const result = new Set<string>();
  for (let i = 0; i <= words.length - 5; i++) result.add(words.slice(i, i + 5).join(" "));
  return result;
}
export function similarity(a: Set<string>, b: Set<string>) {
  let intersection = 0;
  const small = a.size < b.size ? a : b;
  const large = small === a ? b : a;
  for (const word of small) if (large.has(word)) intersection++;
  return intersection / (a.size + b.size - intersection || 1);
}
