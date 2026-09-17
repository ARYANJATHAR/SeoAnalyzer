import { z } from "zod";
import type { CompanyFact, Page } from "../../db/schema";
import type { FactSource } from "../ai/types";

export const categories = ["company_name", "brand_alias", "domain", "summary", "description", "product", "category", "target_customer", "use_case", "feature", "integration", "pricing", "region", "security_compliance", "differentiator", "limitation", "customer_proof", "competitor", "other_claim"] as const;
export const factFields = z.object({ category: z.enum(categories), subject: z.string().trim().min(1).max(180), attribute: z.string().trim().min(1).max(180), value: z.string().trim().min(1).max(2000) });
export const extractionSchema = z.object({ facts: z.array(factFields.extend({ confidence: z.number().min(0).max(1), quote: z.string().trim().min(16).max(1000) }).strict()).max(12) }).strict();
export const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/gu, " ").trim();
export const folded = (value: string) => normalize(value).toLowerCase();
export const sourceText = (page: Page) => normalize(page.visibleText || "").slice(0, 8000);
export function supportedQuote(page: Page, quote: string) { return quote.trim().length >= 16 && sourceText(page).includes(normalize(quote)); }
export function factSource(page: Page, quote: string): FactSource { return { pageId: page.id, url: page.finalUrl || page.url, quote: normalize(quote), fetchedAt: page.fetchedAt, textHash: page.textHash }; }
export function potentialContradictions(facts: CompanyFact[]) {
  const groups = new Map<string, CompanyFact[]>();
  for (const fact of facts.filter((f) => f.status !== "rejected")) {
    const key = `${fact.brandId}|${fact.category}|${folded(fact.subject)}|${folded(fact.attribute)}`;
    groups.set(key, [...(groups.get(key) || []), fact]);
  }
  return [...groups.values()].filter((group) => new Set(group.map((f) => folded(f.value))).size > 1).map((group) => ({
    subject: group[0].subject, attribute: group[0].attribute, category: group[0].category,
    factIds: group.map((f) => f.id), values: [...new Set(group.map((f) => f.value))],
    explanation: "Different values were recorded for the same website, category, subject and attribute. Review source dates, product variants and context; this is a possible contradiction, not a verified conflict.",
  }));
}
