import type { FactSource } from "../ai/types";

export const stages = ["problem_discovery", "category_education", "solution_research", "vendor_comparison", "validation_risk", "purchase_decision"] as const;
export const questionTypes = ["category_recommendation", "best_for_use_case", "best_for_industry", "best_for_company_size", "product_capability", "integration", "pricing", "security_compliance", "product_comparison", "alternatives", "migration", "implementation", "evidence_proof", "troubleshooting"] as const;
export type JourneyStage = typeof stages[number];
export type QuestionType = typeof questionTypes[number];
export type ResearchContext = {
  company: { name: string; category: string; description: string; targetCustomer: string; market: string; productNames: string[]; aliases: string[] };
  brands: { id: string; name: string; domain: string }[];
  facts: { id: string; category: string; subject: string; value: string; sources: FactSource[] }[];
};
export const stageLabels: Record<JourneyStage, string> = { problem_discovery: "Problem discovery", category_education: "Category education", solution_research: "Solution research", vendor_comparison: "Vendor comparison", validation_risk: "Validation & risk", purchase_decision: "Purchase decision" };
export function pretty(value: string) { return value.replaceAll("_", " "); }
