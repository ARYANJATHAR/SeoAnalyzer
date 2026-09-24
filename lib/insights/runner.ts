import { and, eq } from "drizzle-orm";
import { database } from "../../db";
import { contentRuns, experimentAnswers, experiments, type ContentRun, type Experiment } from "../../db/schema";
import { answerIsolated, ProviderError } from "../ai/provider";
import { analyzeAnswer, citationsFrom } from "./analysis";
import { buildContentResult, deterministicPage, semanticPage } from "./content";
const stopped = () => new ProviderError("cancelled", "The analysis was stopped.");
export async function executeExperiment(run: Experiment, signal: AbortSignal) {
  const { db } = database();
  const request = { projectId: run.projectId, experimentId: run.id, settings: run.context.settings!, signal, reuse: false };
  const rows = db.select().from(experimentAnswers).where(eq(experimentAnswers.experimentId, run.id)).all();
  const owns = () => {
    signal.throwIfAborted();
    const current = db.select().from(experiments).where(eq(experiments.id, run.id)).get();
    if (!current || current.status !== "running" || current.cancelRequested || current.workerId !== run.workerId) throw stopped();
  };
  for (const row of rows) {
    owns(); if (row.status === "completed") continue;
    let payload = row.payload;
    try {
      if (payload.raw === null || payload.truncated) {
        if (run.mode !== "api") throw new ProviderError("invalid_import", "Imported answer text is unavailable.");
        const answer = await answerIsolated(payload.prompt, { ...request, purpose: "visibility-answer" }, run.context.systemInstruction);
        owns();
        payload = { ...payload, raw: answer.text, completion: answer, provider: answer.provider, model: answer.servedModel, observedAt: new Date().toISOString(), citations: citationsFrom(answer.text, answer.citations), truncated: answer.finishReason === "length", analysis: null };
        db.transaction(() => { owns(); db.update(experimentAnswers).set({ payload, status: "answered", error: null, updatedAt: new Date().toISOString() }).where(eq(experimentAnswers.id, row.id)).run(); }, { behavior: "immediate" });
      }
      if (payload.truncated) throw new ProviderError("truncated", "The answer was cut short. Retry it with more output allowance.");
      const analysis = await analyzeAnswer(payload.raw!, run.context, { ...request, purpose: "visibility-analysis" });
      payload = { ...payload, analysis };
      db.transaction(() => { owns(); db.update(experimentAnswers).set({ payload, status: "completed", error: null, updatedAt: new Date().toISOString() }).where(eq(experimentAnswers.id, row.id)).run(); }, { behavior: "immediate" });
    } catch (error) {
      owns();
      db.update(experimentAnswers).set({ status: "failed", error: "The answer or analysis could not finish; saved text is preserved.", updatedAt: new Date().toISOString() }).where(eq(experimentAnswers.id, row.id)).run();
      if (error instanceof ProviderError && ["budget", "credentials", "missing_key", "quota", "rate_limit", "catalog", "unavailable"].includes(error.code)) throw error;
    }
  }
}
export async function executeContent(run: ContentRun, signal: AbortSignal) {
  const { db } = database();
  const owns = () => {
    signal.throwIfAborted();
    const current = db.select().from(contentRuns).where(eq(contentRuns.id, run.id)).get();
    if (!current || current.status !== "running" || current.workerId !== run.workerId || current.cancelRequested) throw stopped();
  };
  const saved = [...run.result.pages];

  const answers = run.context.answers || [];
  function persist() {
    const result = buildContentResult(run.context, saved, answers);
    db.transaction(() => { owns(); db.update(contentRuns).set({ result }).where(and(eq(contentRuns.id, run.id), eq(contentRuns.workerId, run.workerId!))).run(); }, { behavior: "immediate" });
  }
  for (const page of run.context.pages) {
    owns();
    if (saved.some((p) => p.pageId === page.id && p.status === "completed")) continue;
    let finding = deterministicPage(page, run.context);
    let fatal: unknown;
    try { finding = await semanticPage(page, run.context, { projectId: run.projectId, contentRunId: run.id, settings: run.context.settings!, signal, purpose: "page-readiness", reuse: true }); }
    catch (error) { owns(); finding.error = "AI reading did not finish. Available rule checks are saved."; if (error instanceof ProviderError && ["budget", "missing_key", "credentials", "quota", "rate_limit", "catalog", "unavailable"].includes(error.code)) fatal = error; }
    const at = saved.findIndex((p) => p.pageId === page.id);
    if (at >= 0) saved[at] = finding; else saved.push(finding);
    persist();
    if (fatal) throw fatal;
  }
  persist();
}

