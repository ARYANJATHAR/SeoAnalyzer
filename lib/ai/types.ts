export type ProviderId = "nvidia" | "openrouter";
export type AiSettings = { primary: ProviderId; fallback: boolean; model: string; maxTokens: number; temperature: number; timeoutSeconds: number; requestBudget: number; pageLimit: number };
export type FactSource = { pageId: string; url: string; quote: string; fetchedAt: string; textHash: string | null };
export type FactStatus = "unreviewed" | "confirmed" | "rejected";
export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
export type Completion = { text: string; provider: ProviderId; model: string; servedModel: string; upstream: string | null; inputTokens: number | null; outputTokens: number | null; cost: number | null; citations: string[]; finishReason: string | null; ledgerId: string };
