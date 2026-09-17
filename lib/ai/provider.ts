import { createHash, randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../../db";
import { aiUsage } from "../../db/schema";
import { InputError } from "../security/url";
import { boundedJson, configuredModel } from "./catalog";
import { credential, getSettings, redact } from "./config";
import { endpoints, sharedModels } from "./models";
import type { AiMessage, AiSettings, Completion, ProviderId } from "./types";

export class ProviderError extends InputError {
  constructor(public code: string, message: string, public canFallback = false, public canRetry = false, public retryAfter = 0) { super(message, 409); }
}
const responseSchema = z.object({
  model: z.string().optional(), provider: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable().optional(), refusal: z.string().nullable().optional(), annotations: z.array(z.object({ type: z.string(), url_citation: z.object({ url: z.string() }).optional() })).optional() }), finish_reason: z.string().nullable().optional() })).min(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative().optional(), completion_tokens: z.number().int().nonnegative().optional(), cost: z.number().nonnegative().optional() }).optional(),
  citations: z.array(z.string()).optional(),
});
export type RequestContext = { projectId: string; jobId?: string; purpose: string; settings: AiSettings; signal: AbortSignal; reuse?: boolean; onCache?: (ledgerId: string) => void };
export interface AiProvider {
  id: ProviderId;
  complete(messages: AiMessage[], model: string, context: RequestContext): Promise<Completion>;
}
function statusError(status: number, retry: string | null) {
  const seconds = retry ? (/^\d+(\.\d+)?$/.test(retry) ? Number(retry) : Math.max(0, (Date.parse(retry) - Date.now()) / 1000)) : 0;
  const wait = Number.isFinite(seconds) ? seconds : 0;
  if (status === 401 || status === 403) return new ProviderError("credentials", "Provider rejected these credentials or account access. Check the server environment key and account permissions.", true);
  if (status === 402) return new ProviderError("quota", "Provider credits or account quota are unavailable.", true);
  if (status === 404) return new ProviderError("model", "The selected model is not available at this provider.", true);
  if (status === 429) return new ProviderError("rate_limit", "Provider rate limit reached. Try again later or use the configured backup.", true, true, wait);
  if (status === 408 || status >= 500) return new ProviderError("unavailable", "Provider timed out or is temporarily unavailable.", true, true, wait);
  return new ProviderError("request", `Provider rejected the request (HTTP ${status}). Review the model and generation settings.`);
}

class CompatibleProvider implements AiProvider {
  constructor(public id: ProviderId) {}
  async complete(messages: AiMessage[], model: string, context: RequestContext): Promise<Completion> {
    const key = credential(this.id);
    if (!key) throw new ProviderError("missing_key", `Add ${this.id === "nvidia" ? "NVIDIA_API_KEY" : "OPENROUTER_API_KEY"} to the server environment.`, true);
    context.signal.throwIfAborted();
    const { db } = database();
    // Super supports disabling reasoning so the extraction allowance goes to JSON.
    // Keep other models' native behavior; reasoning controls are not universal.
    const generationOptions = model.replace(/:free$/, "") === "nvidia/nemotron-3-super-120b-a12b"
      ? this.id === "nvidia" ? { chat_template_kwargs: { enable_thinking: false } } : { reasoning: { enabled: false } }
      : {};
    const cacheKey = createHash("sha256").update(JSON.stringify({ messages, provider: this.id, model, maxTokens: context.settings.maxTokens, temperature: context.settings.temperature, generationOptions })).digest("hex");
    if (context.reuse) {
      const cached = db.select().from(aiUsage).where(and(eq(aiUsage.projectId, context.projectId), eq(aiUsage.cacheKey, cacheKey), eq(aiUsage.status, "validated"))).orderBy(desc(aiUsage.createdAt)).get();
      if (cached?.responseText) {
        context.onCache?.(cached.id);
        return { text: cached.responseText, provider: this.id, model, servedModel: cached.servedModel || model, upstream: cached.upstream, inputTokens: cached.inputTokens, outputTokens: cached.outputTokens, cost: cached.cost, citations: [], finishReason: null, ledgerId: cached.id };
      }
    }
    // Serial worker + a minimum interval avoid bursts; provider rate limits remain authoritative.
    await pause(3100, undefined, { signal: context.signal });
    const id = randomUUID(), createdAt = new Date().toISOString();
    db.transaction((tx) => {
      const used = tx.select({ count: sql<number>`count(*)` }).from(aiUsage).where(eq(aiUsage.projectId, context.projectId)).get()!.count;
      const budget = Math.min(context.settings.requestBudget, getSettings(context.projectId).requestBudget);
      if (used >= budget) throw new ProviderError("budget", "This project's request budget is exhausted. Increase the total budget in AI settings to authorize more requests.");
      tx.insert(aiUsage).values({ id, projectId: context.projectId, jobId: context.jobId || null, purpose: context.purpose, provider: this.id, model, cacheKey, status: "pending", requestText: redact(JSON.stringify(messages)), createdAt }).run();
    }, { behavior: "immediate" });
    let httpStatus: number | null = null;
    try {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(context.settings.timeoutSeconds * 1000)]);
      const response = await fetch(`${endpoints[this.id]}/chat/completions`, {
        method: "POST", redirect: "error", signal, headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: false, max_tokens: context.purpose.startsWith("credential-check") ? 32 : context.settings.maxTokens, temperature: context.settings.temperature,
          ...generationOptions,
          ...(this.id === "openrouter" ? { provider: { max_price: { prompt: 0, completion: 0 }, allow_fallbacks: true } } : {}),
        }),
      });
      httpStatus = response.status;
      if (!response.ok) { await response.body?.cancel(); throw statusError(response.status, response.headers.get("retry-after")); }
      const raw = await boundedJson(response, 1_000_000);
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success) throw new ProviderError("response", "The provider returned an unsupported response. No facts were accepted.", true);
      const data = parsed.data, choice = data.choices[0];
      const text = redact(choice.message.content || "");
      const result: Completion = { text, provider: this.id, model, servedModel: redact(data.model || model), upstream: data.provider ? redact(data.provider) : null,
        inputTokens: data.usage?.prompt_tokens ?? null, outputTokens: data.usage?.completion_tokens ?? null, cost: data.usage?.cost ?? null,
        citations: [...new Set([...(data.citations || []), ...(choice.message.annotations || []).flatMap((annotation) => annotation.url_citation ? [annotation.url_citation.url] : [])])].filter((url) => /^https?:\/\//i.test(url)).map(redact), finishReason: choice.finish_reason || null, ledgerId: id };
      db.update(aiUsage).set({ status: "completed", httpStatus, responseText: text, servedModel: result.servedModel, upstream: result.upstream,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens, cost: result.cost, completedAt: new Date().toISOString() }).where(eq(aiUsage.id, id)).run();
      // A valid inference envelope proves key/model access even if a reasoning model uses
      // the tiny validation allowance before producing user-facing text.
      if (context.purpose.startsWith("credential-check")) return result;
      if (choice.message.refusal || choice.finish_reason === "content_filter") throw new ProviderError("refusal", "The model declined this request. No fallback was attempted for a refusal.");
      if (!text.trim()) throw new ProviderError("empty", "The model returned no answer text. Try a different shared model or larger output limit.", true);
      return result;
    } catch (error) {
      const safe = context.signal.aborted ? new ProviderError("cancelled", "AI request cancelled.") : error instanceof ProviderError ? error : new ProviderError("network", "Provider connection failed or timed out.", true, true);
      db.update(aiUsage).set({ status: safe.code === "cancelled" ? "cancelled" : "failed", httpStatus, error: safe.message, completedAt: new Date().toISOString() }).where(eq(aiUsage.id, id)).run();
      throw safe;
    }
  }
}
export const providers: Record<ProviderId, AiProvider> = { nvidia: new CompatibleProvider("nvidia"), openrouter: new CompatibleProvider("openrouter") };

export async function generate(messages: AiMessage[], context: RequestContext, onlyProvider?: ProviderId): Promise<Completion> {
  const selected = await configuredModel(context.settings.model);
  const primary = onlyProvider || context.settings.primary;
  const order: ProviderId[] = onlyProvider || !context.settings.fallback ? [primary] : [primary, primary === "nvidia" ? "openrouter" : "nvidia"];
  let failure: ProviderError = new ProviderError("unavailable", "No configured provider is currently available. Refresh the catalog and check server keys.");
  for (const provider of order) {
    context.signal.throwIfAborted();
    if (!credential(provider)) { failure = new ProviderError("missing_key", `No server key configured for ${provider}.`, true); continue; }
    const available = provider === "nvidia" ? selected.nvidiaAvailable : selected.openrouterAvailable;
    if (available !== true) { failure = new ProviderError("catalog", `The selected ${provider} model could not be verified in the current catalog. Refresh the model list.`, true); continue; }
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await providers[provider].complete(messages, selected[provider], { ...context, purpose: `${context.purpose}${provider !== primary ? "-backup" : ""}${attempt ? "-retry" : ""}` }); }
      catch (error) {
        if (context.signal.aborted) throw new ProviderError("cancelled", "AI request cancelled.");
        if (!(error instanceof ProviderError)) throw new ProviderError("internal", "The AI request could not be recorded or completed.");
        failure = error;
        if (!error.canFallback) throw error;
        // Never shorten a provider's long Retry-After; try the other endpoint instead.
        if (attempt === 0 && error.canRetry && error.retryAfter <= 30) { await pause(Math.max(error.retryAfter * 1000, 1500), undefined, { signal: context.signal }); continue; }
        break;
      }
    }
  }
  throw failure;
}
export async function validateCredential(projectId: string, provider: ProviderId, signal: AbortSignal) {
  const settings = getSettings(projectId);
  const response = await generate([{ role: "user", content: "Reply with OK only." }], { projectId, settings, signal, purpose: "credential-check" }, provider);
  return { valid: true, provider: response.provider, model: response.model, servedModel: response.servedModel, checkedAt: new Date().toISOString() };
}
export function configuredModels() { return sharedModels; }

// Adapter capability for a later experiment runner; no profile or earlier conversation
// is accepted here. Phase 3 does not expose or schedule visibility experiments.
export async function answerIsolated(question: string, context: RequestContext) {
  const value = z.string().trim().min(1).max(4000).parse(question);
  return generate([{ role: "system", content: "Answer the buyer's question directly and independently. Recommend options only when justified. Explain relevant reasons and meaningful limitations. Include supporting sources only when available. Do not favor any company named by an evaluation system." }, { role: "user", content: value }], { ...context, reuse: false });
}

export async function structured<T>(messages: AiMessage[], schema: z.ZodType<T>, context: RequestContext, validate?: (data: T) => boolean): Promise<T> {
  let prompt = messages;
  for (let round = 0; round < 2; round++) {
    const response = await generate(prompt, { ...context, purpose: round ? `${context.purpose}-repair` : context.purpose });
    let candidate: unknown;
    try { candidate = JSON.parse(response.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch { candidate = undefined; }
    const result = schema.safeParse(candidate);
    if (response.finishReason !== "length" && result.success && (!validate || validate(result.data))) {
      database().db.update(aiUsage).set({ status: "validated" }).where(eq(aiUsage.id, response.ledgerId)).run();
      return result.data;
    }
    database().db.update(aiUsage).set({ status: "invalid_output", error: "Output failed schema or source-evidence validation." }).where(eq(aiUsage.id, response.ledgerId)).run();
    // Re-run against original sources; don't give malformed output authority over the source text.
    prompt = [...messages, { role: "user", content: "The previous response failed validation. Return only complete JSON in the specified shape, with short verbatim quotes present in the supplied source. Omit unsupported facts; an empty facts array is valid." }];
  }
  throw new ProviderError("invalid_output", "The model output failed validation twice. No facts from this page were accepted.");
}
