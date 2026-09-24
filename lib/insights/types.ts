import type { AiSettings, Completion, FactSource } from "../ai/types";
import type { BuyerQuestion, Page, AuditIssue, ExperimentAnswer } from "../../db/schema";

export const DEMO_ID = "00000000-0000-4000-8000-000000000009";
export type State = "queued" | "running" | "completed" | "partial" | "cancelled";
export type TrackedBrand = { id: string; name: string; domain: string; kind: "target" | "competitor"; aliases: string[] };
export type ReferenceFact = { id: string; brandId: string; category: string; subject: string; attribute: string; value: string; sources: FactSource[] };
export type Question = Pick<BuyerQuestion, "id" | "text" | "stage" | "type" | "personaId" | "geography" | "intent">;
export type ExperimentContext = { brands: TrackedBrand[]; facts: ReferenceFact[]; questions: Question[]; promptVersion: string; systemInstruction?: string; promptHash: string; samples: number; settings: AiSettings | null };
export type Analysis = {
  entities: { name: string; quote: string }[];
  brands: { brandId: string; quote: string; firstPosition: number; recommended: boolean; recommendationPosition: number | null; strength: "strong" | "moderate" | "neutral" | "discouraged"; sentiment: "positive" | "neutral" | "mixed" | "negative"; reasons: string[]; limitations: string[]; confidence: number; rationale: string }[];
  claims: { text: string; quote: string; classification: "supported" | "contradicted" | "unverifiable" | "time_sensitive"; factIds: string[]; confidence: number; rationale: string }[];
  refused: boolean; refusalReason: string | null;
};
export type Citation = { url: string; domain: string; source: "provider" | "answer_text" | "manual" };
export type AnswerPayload = { question: Question; sample: number; prompt: string; raw: string | null; completion: Completion | null; citations: Citation[]; analysis: Analysis | null; provider: string | null; model: string | null; observedAt: string | null; notes: string; truncated: boolean };
export type ContentContext = { answers?: ExperimentAnswer[]; answerRunId?: string; brands: TrackedBrand[]; facts: ReferenceFact[]; questions: Question[]; pages: Page[]; issues: AuditIssue[]; crawls: { id: string; brandId: string; createdAt: string; status: string; pagesFetched: number }[]; settings: AiSettings | null };
export type Component = { name: string; weight: number; points: number | null; method: "rule" | "AI"; reason: string; confidence: number | null; quote?: string };
export type PageInsight = { pageId: string; brandId: string; url: string; title: string; pageType: string; topic: string; products: string[]; evidenceGaps?: { quote: string; reason: string }[]; personaIds: string[]; stages: string[]; matches: { questionId: string; quote: string; reason: string }[]; components: Component[]; score: number | null; evaluatedWeight: number; excerptLength: number; textHash: string | null; fetchedAt: string; similarUrls: string[]; status: "completed" | "partial"; error: string | null };
export type Gap = { id: string; questionId: string; question: string; type: string; targetUrls: string[]; competitorUrls: string[]; checkedTargetUrls: string[]; reason: string; action: "create" | "update" | "add evidence"; effort: "small" | "medium" | "large"; impact: number; confidence: number };
export type Recommendation = { id: string; title: string; category: string; reason: string; evidence: string[]; urls: string[]; questionIds: string[]; expectedResult: string; effort: "small" | "medium" | "large"; owner: string; priority: number; confidence: number; acceptance: string[]; month: 1 | 2 | 3; inputs: { commercialImpact: number; visibilityGap: number; confidence: number; strategicRelevance: number; ease: number } };
export type ContentResult = { pages: PageInsight[]; gaps: Gap[]; recommendations: Recommendation[]; coverage: string[]; repeatOn: string };

