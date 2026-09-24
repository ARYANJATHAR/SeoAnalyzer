import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../../db";
import { aiUsage, auditIssues, auditRuns, brands, buyerPersonas, buyerQuestions, companyFacts, contentRuns, crawlRuns, experimentAnswers, experiments, pages } from "../../db/schema";
import { getProject } from "../../db/repositories/projects";
import { getSettings, redact } from "../ai/config";
import { InputError } from "../security/url";
import { DEMO_ID, type AnswerPayload, type ContentContext, type ExperimentContext, type Question } from "./types";
import { citationsFrom } from "./analysis";
import { metrics } from "./metrics";
import { csvRows } from "./csv";
import { RULE_VERSION } from "../audit/engine";

import { VISIBILITY_SYSTEM } from "../ai/provider";
export const PROMPT_VERSION = "independent-buyer-v1";
export function referenceContext(projectId: string) {
  const project = getProject(projectId), { db } = database();
  const tracked = db.select().from(brands).where(and(eq(brands.projectId, projectId), eq(brands.active, true))).all();
  const allFacts = db.select().from(companyFacts).where(and(eq(companyFacts.projectId, projectId), ne(companyFacts.status, "rejected"))).orderBy(desc(companyFacts.updatedAt)).all()
    .filter((f) => tracked.some((b) => b.id === f.brandId));
  const facts = tracked.flatMap((b) => allFacts.filter((f) => f.brandId === b.id).slice(0, b.kind === "target" ? 60 : 12))
    .map(({ id, brandId, category, subject, attribute, value, sources }) => ({ id, brandId, category, subject, attribute, value, sources }));
  return { brands: tracked.map((b) => ({ id: b.id, name: b.name, domain: b.domain, kind: b.kind, aliases: [...new Set([b.name, new URL(b.domain).hostname.replace(/^www\./, ""), ...(b.kind === "target" ? [...project.brandAliases, ...project.productNames] : []), ...facts.filter((f) => f.brandId === b.id && ["company_name", "brand_alias", "product"].includes(f.category)).map((f) => f.value)])].filter((s) => s.length >= 2) })), facts };
}
export function selectedQuestions(projectId: string): Question[] {
  return database().db.select().from(buyerQuestions).where(and(eq(buyerQuestions.projectId, projectId), eq(buyerQuestions.status, "active"), eq(buyerQuestions.selected, true))).orderBy(asc(buyerQuestions.id)).all()
    .map(({ id, text, stage, type, personaId, geography, intent }) => ({ id, text, stage, type, personaId, geography, intent }));
}
export function questionPrompt(q: Question) { return q.text + (q.geography && q.geography !== "Unspecified" ? "\nBuyer location: " + q.geography : ""); }
export function estimateRun(projectId: string, samples = 1) {
  const questions = selectedQuestions(projectId), settings = getSettings(projectId);
  if (![1, 3, 5].includes(samples)) throw new InputError("Choose 1, 3 or 5 answers per question.");
  const used = database().db.select({ n: sql<number>`count(*)` }).from(aiUsage).where(eq(aiUsage.projectId, projectId)).get()!.n;
  return { questions: questions.length, samples, answers: questions.length * samples, expectedRequests: questions.length * samples * 2, estimatedCostUsd: null, approximateInputTokens: Math.ceil(questions.reduce((sum, q) => sum + questionPrompt(q).length / 4 + 5000, 0) * samples), maximumOutputTokens: questions.length * samples * 2 * settings.maxTokens, remaining: Math.max(0, settings.requestBudget - used),
    explanation: "Each answer normally uses one request to answer and one to analyze. Repairs, retries and backup attempts use more. Free availability is account-dependent; this is a planning estimate." };
}
export function startExperiment(projectId: string, value: unknown = {}) {
  const { samples } = z.object({ samples: z.union([z.literal(1), z.literal(3), z.literal(5)]).default(1) }).strict().parse(value);
  if (projectId === DEMO_ID) throw new InputError("This is a saved demonstration. Create your own project for a live check.");
  const questions = selectedQuestions(projectId);
  if (!questions.length || questions.length > 20) throw new InputError("Select between 1 and 20 buyer questions first.");
  const context: ExperimentContext = { ...referenceContext(projectId), questions, samples, settings: getSettings(projectId), promptVersion: PROMPT_VERSION, systemInstruction: VISIBILITY_SYSTEM,
    promptHash: createHash("sha256").update(JSON.stringify(questions.map((q) => [q.id, questionPrompt(q)]))).digest("hex") };
  return database().db.transaction((tx) => {
    const active = tx.select().from(experiments).where(and(eq(experiments.projectId, projectId), eq(experiments.mode, "api"), inArray(experiments.status, ["queued", "running"]))).get();
    if (active) return { id: active.id };
    const id = randomUUID(), now = new Date().toISOString();
    tx.insert(experiments).values({ id, projectId, mode: "api", context, createdAt: now }).run();
    let ordinal = 0;
    for (const question of questions) for (let sample = 1; sample <= samples; sample++) {
      const payload: AnswerPayload = { question, sample, prompt: questionPrompt(question), raw: null, completion: null, citations: [], analysis: null, provider: null, model: null, observedAt: null, notes: "", truncated: false };
      tx.insert(experimentAnswers).values({ id: randomUUID(), experimentId: id, ordinal: ordinal++, payload, updatedAt: now }).run();
    }
    return { id };
  }, { behavior: "immediate" });
}
export function experimentFor(projectId: string, id: string) {
  getProject(projectId);
  const row = database().db.select().from(experiments).where(and(eq(experiments.id, id), eq(experiments.projectId, projectId))).get();
  if (!row) throw new InputError("Check not found.", 404);
  return row;
}
export function changeExperiment(projectId: string, id: string, action: "stop" | "resume") {
  const { db } = database();
  return db.transaction((tx) => {
    const row = experimentFor(projectId, id);
    if (row.mode === "demo") throw new InputError("Demonstration results are read-only.");
    if (action === "stop") {
      tx.update(experiments).set(row.status === "queued" ? { cancelRequested: true, status: "cancelled", completedAt: new Date().toISOString() } : { cancelRequested: true }).where(eq(experiments.id, id)).run();
    } else {
      if (["queued", "running", "completed"].includes(row.status)) return { id };
      if (tx.select().from(experiments).where(and(eq(experiments.projectId, projectId), inArray(experiments.status, ["queued", "running"]))).get()) throw new InputError("Wait for the current check to finish.", 409);
      tx.update(experimentAnswers).set({ status: "pending", error: null }).where(and(eq(experimentAnswers.experimentId, id), eq(experimentAnswers.status, "failed"))).run();
      tx.update(experiments).set({ status: "queued", cancelRequested: false, workerId: null, heartbeatAt: null, error: null, completedAt: null, context: { ...row.context, settings: row.context.settings ? { ...row.context.settings, requestBudget: getSettings(projectId).requestBudget } : null } }).where(eq(experiments.id, id)).run();
    }
    return { id };
  }, { behavior: "immediate" });
}
const manualSchema = z.object({ provider: z.string().trim().min(1).max(120), model: z.string().trim().max(160).default("Unknown"), question: z.string().trim().min(5).max(4000), answer: z.string().min(1).max(24000), citation_urls: z.string().max(4000).default(""), observed_at: z.string().min(1).refine((s) => Number.isFinite(Date.parse(s)) && Date.parse(s) <= Date.now(), "Use a valid observation date that is not in the future"), notes: z.string().max(1000).default("") }).strict();
export function importAnswers(projectId: string, input: unknown) {
  if (projectId === DEMO_ID) throw new InputError("Create your own project to import answers.");
  const wrapper = z.object({ csv: z.string().max(250000).optional(), answer: manualSchema.optional() }).strict().parse(input);
  if (!!wrapper.csv === !!wrapper.answer) throw new InputError("Provide one answer or one CSV file.");
  const rows = wrapper.csv ? csvRows(wrapper.csv).map((r) => manualSchema.parse(r)) : [wrapper.answer!];
  if (!rows.length || rows.length > 100) throw new InputError("Import between 1 and 100 answers.");
  const library = database().db.select().from(buyerQuestions).where(eq(buyerQuestions.projectId, projectId)).all();
  const questions: Question[] = rows.map((r) => {
    const match = library.find((q) => q.text.trim().toLowerCase() === r.question.trim().toLowerCase());
    return match ? { id: match.id, text: match.text, stage: match.stage, type: match.type, personaId: match.personaId, geography: match.geography, intent: match.intent } :
      { id: randomUUID(), text: redact(r.question), stage: "solution_research", type: "category_recommendation", personaId: "", geography: "Unspecified", intent: 3 };
  });
  const context: ExperimentContext = { ...referenceContext(projectId), questions, samples: 1, settings: getSettings(projectId), promptVersion: "manual-uncontrolled", promptHash: "", };
  return database().db.transaction((tx) => {
    const id = randomUUID(), now = new Date().toISOString();
    tx.insert(experiments).values({ id, projectId, mode: "manual", context, createdAt: now }).run();
    rows.forEach((r, i) => {
      const supplied = r.citation_urls.split(/[;\s]+/).filter(Boolean);
      if (supplied.some((s) => !citationsFrom("", [s], "manual").length)) throw new InputError("Citation links must be public HTTP or HTTPS URLs without credentials.");
      tx.insert(experimentAnswers).values({ id: randomUUID(), experimentId: id, ordinal: i, status: "answered", updatedAt: now,
        payload: { question: questions[i], sample: 1, prompt: redact(r.question), raw: redact(r.answer), completion: null, citations: citationsFrom(r.answer, supplied, "manual"), analysis: null, provider: redact(r.provider), model: redact(r.model || "Unknown"), observedAt: new Date(r.observed_at).toISOString(), notes: redact(r.notes), truncated: false } }).run();
    });
    return { id };
  }, { behavior: "immediate" });
}
export function startContent(projectId: string) {
  if (projectId === DEMO_ID) throw new InputError("The demo already contains saved content findings.");
  const { db } = database(), reference = referenceContext(projectId);
  const crawls = reference.brands.flatMap((b) => { const run = db.select().from(crawlRuns).where(eq(crawlRuns.brandId, b.id)).orderBy(desc(crawlRuns.createdAt)).get(); return run ? [run] : []; });
  if (crawls.some((r) => ["queued", "running"].includes(r.status))) throw new InputError("Wait for website collection to finish before analyzing content.");
  const selectedPages = crawls.flatMap((r) => db.select().from(pages).where(eq(pages.crawlRunId, r.id)).all().filter((p) => p.statusCode === 200 && !!p.visibleText)
    .sort((a, b) => Number(new URL(a.url).pathname !== "/") - Number(new URL(b.url).pathname !== "/") || a.url.localeCompare(b.url)).slice(0, 12));
  if (!selectedPages.length) throw new InputError("Collect readable website pages first.");
  const audits = crawls.flatMap((r) => db.select().from(auditRuns).where(and(eq(auditRuns.crawlRunId, r.id), eq(auditRuns.ruleVersion, RULE_VERSION))).all());
  const targetCrawls = crawls.filter((r) => reference.brands.some((b) => b.id === r.brandId && b.kind === "target")); const targetAudits = audits.filter((r) => targetCrawls.some((c) => c.id === r.crawlRunId)); const issues = targetAudits.length ? db.select().from(auditIssues).where(inArray(auditIssues.auditRunId, targetAudits.map((r) => r.id))).all() : [];
  const latestAnswers = db.select().from(experiments).where(eq(experiments.projectId, projectId)).orderBy(desc(experiments.createdAt)).get();
  const answerSnapshot = latestAnswers ? db.select().from(experimentAnswers).where(eq(experimentAnswers.experimentId, latestAnswers.id)).all() : [];
  const context: ContentContext = { ...reference, answerRunId: latestAnswers?.id, answers: answerSnapshot, questions: selectedQuestions(projectId), pages: selectedPages, issues, crawls: crawls.map(({ id, brandId, createdAt, status, pagesFetched }) => ({ id, brandId, createdAt, status, pagesFetched })), settings: getSettings(projectId) };
  return db.transaction((tx) => {
    const existing = tx.select().from(contentRuns).where(and(eq(contentRuns.projectId, projectId), inArray(contentRuns.status, ["queued", "running"]))).get();
    if (existing) return { id: existing.id };
    const id = randomUUID();
    tx.insert(contentRuns).values({ id, projectId, context, result: { pages: [], gaps: [], recommendations: [], coverage: [], repeatOn: "" }, createdAt: new Date().toISOString() }).run();
    return { id };
  }, { behavior: "immediate" });
}
export function changeContent(projectId: string, id: string, action: "stop" | "resume") {
  const { db } = database();
  return db.transaction((tx) => {
    const run = tx.select().from(contentRuns).where(and(eq(contentRuns.id, id), eq(contentRuns.projectId, projectId))).get();
    if (!run) throw new InputError("Content analysis not found.", 404);
    if (projectId === DEMO_ID) throw new InputError("Demonstration results are read-only.");
    if (action === "stop") tx.update(contentRuns).set(run.status === "queued" ? { status: "cancelled", cancelRequested: true } : { cancelRequested: true }).where(eq(contentRuns.id, id)).run();
    else if (!["running", "queued", "completed"].includes(run.status)) {
      if (tx.select().from(contentRuns).where(and(eq(contentRuns.projectId, projectId), inArray(contentRuns.status, ["queued", "running"]))).get()) throw new InputError("Wait for the active content analysis.", 409);
      tx.update(contentRuns).set({ status: "queued", cancelRequested: false, error: null, workerId: null, completedAt: null, context: { ...run.context, settings: run.context.settings ? { ...run.context.settings, requestBudget: getSettings(projectId).requestBudget } : null } }).where(eq(contentRuns.id, id)).run();
    }
    return { id };
  }, { behavior: "immediate" });
}
export type Filters = { run?: string; from?: string; to?: string; stage?: string; type?: string; persona?: string; provider?: string; question?: string };
export function insightSnapshot(projectId: string, filters: Filters = {}) {
  const project = getProject(projectId), { db } = database();
  const runs = db.select().from(experiments).where(eq(experiments.projectId, projectId)).orderBy(desc(experiments.createdAt)).all();
  const chosen = filters.run ? runs.find((r) => r.id === filters.run) : runs[0];
  if (filters.run && !chosen) throw new InputError("Check not found.", 404);
  const all = chosen ? db.select().from(experimentAnswers).where(eq(experimentAnswers.experimentId, chosen.id)).orderBy(asc(experimentAnswers.ordinal)).all() : [];
  const filtered = all.filter(({ payload: a }) => (!filters.from || (a.observedAt || "").slice(0, 10) >= filters.from) && (!filters.to || (a.observedAt || "").slice(0, 10) <= filters.to)
    && (!filters.stage || a.question.stage === filters.stage) && (!filters.type || a.question.type === filters.type) && (!filters.persona || a.question.personaId === filters.persona)
    && (!filters.question || a.question.text.toLowerCase().includes(filters.question.toLowerCase())) && (!filters.provider || a.provider + " / " + a.model === filters.provider));
  const content = db.select().from(contentRuns).where(eq(contentRuns.projectId, projectId)).orderBy(desc(contentRuns.createdAt)).get();
  const previous = chosen && chosen.mode === "api" ? runs.find((r) => r.id !== chosen.id && r.createdAt < chosen.createdAt && r.mode === chosen.mode && r.context.promptHash === chosen.context.promptHash && r.context.promptVersion === chosen.context.promptVersion && r.context.samples === chosen.context.samples && r.context.settings?.model === chosen.context.settings?.model && r.context.settings?.temperature === chosen.context.settings?.temperature && r.context.settings?.maxTokens === chosen.context.settings?.maxTokens && JSON.stringify(r.context.brands.map((b) => [b.id, b.domain])) === JSON.stringify(chosen.context.brands.map((b) => [b.id, b.domain]))) : undefined;
  const priorAnswers = previous ? db.select().from(experimentAnswers).where(eq(experimentAnswers.experimentId, previous.id)).all() : [];
  const safeRun = (r: typeof runs[number]) => ({ id: r.id, mode: r.mode, status: r.status, createdAt: r.createdAt, completedAt: r.completedAt, samples: r.context.samples, questions: r.context.questions.length, error: r.error ? "Some work could not finish. Saved results remain available." : null });
  return { personas: db.select({ id: buyerPersonas.id, role: buyerPersonas.role }).from(buyerPersonas).where(eq(buyerPersonas.projectId, projectId)).all(), scopes: [...new Set(all.filter((a) => a.payload.provider).map((a) => a.payload.provider + " / " + a.payload.model))], project: { id: project.id, name: project.name }, demo: projectId === DEMO_ID, runs: runs.map(safeRun), run: chosen ? safeRun(chosen) : null,
    metrics: metrics(filtered, chosen?.context.brands || []), history: runs.slice(0, 20).map((r) => ({ ...safeRun(r), metrics: metrics(db.select().from(experimentAnswers).where(eq(experimentAnswers.experimentId, r.id)).all(), r.context.brands) })),
    comparison: previous ? { run: safeRun(previous), metrics: metrics(priorAnswers, previous.context.brands), note: "Matching questions, sample count, prompt version and requested model. Compare matching served-model groups; source facts may have changed. Current filters do not apply to this prior run." } : null,
    answers: filtered.map((a) => ({ id: a.id, status: a.status, question: a.payload.question, sample: a.payload.sample, observedAt: a.payload.observedAt, provider: a.payload.provider, model: a.payload.model, citations: a.payload.citations, analysis: a.payload.analysis, truncated: a.payload.truncated, error: a.error ? "This answer or its analysis needs another attempt." : null })),
    progress: { total: all.length, completed: all.filter((a) => a.status === "completed").length, answered: all.filter((a) => a.payload.raw !== null).length },
    content: content ? { id: content.id, status: content.status, createdAt: content.createdAt, total: content.context.pages.length, questions: content.context.questions, result: content.result, brands: content.context.brands, error: content.error ? "Some pages could not be analyzed. Saved findings remain available." : null } : null };
}
export type InsightSnapshot = ReturnType<typeof insightSnapshot>;

