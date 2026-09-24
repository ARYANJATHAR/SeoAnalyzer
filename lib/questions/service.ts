import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../../db";
import { aiUsage, brands, buyerPersonas, buyerQuestions, companyFacts, questionJobs, researchFlows, type BuyerQuestion } from "../../db/schema";
import { getProject } from "../../db/repositories/projects";
import { configuredKeys, getSettings, redact } from "../ai/config";
import { configuredModel } from "../ai/catalog";
import { InputError } from "../security/url";
import { isBranded, nearDuplicate, normalizedQuestion, personaFields, questionFields, recommendedQuestions } from "./rules";
import type { ResearchContext } from "./types";

export const QUESTION_PROMPT_VERSION = "buyer-research-1.0.0";
export function researchContext(projectId: string): ResearchContext {
  const project = getProject(projectId), { db } = database();
  const sites = db.select().from(brands).where(and(eq(brands.projectId, projectId), eq(brands.active, true))).all();
  const target = sites.find((site) => site.kind === "target");
  const facts = target ? db.select().from(companyFacts).where(and(eq(companyFacts.projectId, projectId), eq(companyFacts.brandId, target.id), ne(companyFacts.status, "rejected"))).orderBy(desc(companyFacts.updatedAt)).all() : [];
  // Bound the source context and keep exact evidence locally in the job snapshot.
  const chosen: typeof facts = [];
  const seen = new Set<string>();
  for (const fact of facts) {
    const key = normalizedQuestion(`${fact.subject} ${fact.attribute} ${fact.value}`);
    if (seen.has(key)) continue;
    seen.add(key); chosen.push(fact);
    if (chosen.length === 40) break;
  }
  const inferredName = project.companyName === new URL(project.primaryDomain).hostname ? chosen.find((fact) => fact.category === "company_name")?.value.slice(0, 200) : undefined;
  const fromWebsite = (value: string, categories: string[]) => value !== "Not provided" ? value : chosen.find((fact) => categories.includes(fact.category))?.value.slice(0, 1000) || "Unknown from available website content";
  return { company: { name: inferredName || project.companyName, category: fromWebsite(project.category, ["category"]), description: fromWebsite(project.description, ["summary", "description"]), targetCustomer: fromWebsite(project.targetCustomer, ["target_customer"]), market: project.market, productNames: project.productNames, aliases: project.brandAliases },
    brands: sites.map((site) => ({ id: site.id, name: site.kind === "target" && inferredName ? inferredName : site.name, domain: site.domain })),
    facts: chosen.map((fact) => ({ id: fact.id, category: fact.category, subject: fact.subject, value: fact.value.slice(0, 600), sources: fact.sources })),
  };
}
export function brandNames(context: ResearchContext) { return [context.company.name, ...context.company.aliases, ...context.company.productNames, ...context.brands.map((brand) => brand.name)]; }
export function selectionVersion(rows: BuyerQuestion[]) { return createHash("sha256").update(JSON.stringify(rows.map((row) => [row.id, row.revision, row.selected, row.status]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest("hex"); }
export function baselineReady(rows: BuyerQuestion[]) {
  const active = rows.filter((row) => row.status === "active");
  return active.length >= 30 && active.some((q) => q.intent <= 2) && active.some((q) => q.intent >= 4) && active.some((q) => q.branded) && active.some((q) => !q.branded);
}
export function questionSnapshot(projectId: string) {
  const project = getProject(projectId), { db } = database();
  const personas = db.select().from(buyerPersonas).where(eq(buyerPersonas.projectId, projectId)).orderBy(asc(buyerPersonas.createdAt)).all();
  const questions = db.select().from(buyerQuestions).where(eq(buyerQuestions.projectId, projectId)).orderBy(asc(buyerQuestions.createdAt), asc(buyerQuestions.id)).all();
  const jobs = db.select().from(questionJobs).where(eq(questionJobs.projectId, projectId)).orderBy(desc(questionJobs.createdAt)).limit(10).all();
  const context = researchContext(projectId);
  return { project: { id: project.id, name: project.name, market: project.market }, personas, questions, analysisActive: !!db.select().from(researchFlows).where(and(eq(researchFlows.projectId, projectId), eq(researchFlows.status, "running"))).get(),
    brands: db.select({ id: brands.id, name: brands.name, active: brands.active }).from(brands).where(eq(brands.projectId, projectId)).all(),
    facts: context.facts, selectionVersion: selectionVersion(questions), recommendedIds: recommendedQuestions(questions).map((q) => q.id), ready: personas.length >= 2 && baselineReady(questions),
    jobs: jobs.map((job) => ({ id: job.id, status: job.status, createdAt: job.createdAt, questionsCreated: job.questionsCreated, cancelRequested: job.cancelRequested,
      message: job.status === "partial" ? "Some suggestions are ready. Generate again to continue toward the baseline."
        : job.status === "failed" ? "Suggestions couldn't be completed. Please try again later or contact the site owner."
        : job.status === "cancelled" ? "Stopped. Saved suggestions remain available." : null })),
  };
}
export type QuestionSnapshot = ReturnType<typeof questionSnapshot>;
export function questionEvidence(projectId: string, id: string) {
  getProject(projectId); const { db } = database();
  const question = db.select().from(buyerQuestions).where(and(eq(buyerQuestions.id, id), eq(buyerQuestions.projectId, projectId))).get();
  if (!question) throw new InputError("Question not found.", 404);
  const job = question.jobId ? db.select().from(questionJobs).where(and(eq(questionJobs.id, question.jobId), eq(questionJobs.projectId, projectId))).get() : null;
  return { facts: question.targetFactIds.flatMap((factId) => {
    const original = job?.context.facts.find((fact) => fact.id === factId);
    if (original) return [{ ...original, fromGenerationSnapshot: true }];
    const fact = db.select().from(companyFacts).where(and(eq(companyFacts.id, factId), eq(companyFacts.projectId, projectId))).get();
    return fact ? [{ id: fact.id, category: fact.category, subject: fact.subject, value: fact.value, sources: fact.sources, fromGenerationSnapshot: false }] : [];
  }) };
}
export type QuestionEvidence = ReturnType<typeof questionEvidence>;
type Tx = Parameters<Parameters<ReturnType<typeof database>["db"]["transaction"]>[0]>[0];
function requireIdle(tx: Tx, projectId: string) {
  if (tx.select().from(questionJobs).where(and(eq(questionJobs.projectId, projectId), inArray(questionJobs.status, ["queued", "running"]))).get()) throw new InputError("Wait for question generation to finish, or stop it before making changes.", 409);
}
export function queueQuestions(projectId: string) {
  const context = researchContext(projectId), settings = getSettings(projectId), { db } = database();
  return db.transaction((tx) => {
    requireIdle(tx, projectId);
    const rows = tx.select().from(buyerQuestions).where(eq(buyerQuestions.projectId, projectId)).all();
    if (baselineReady(rows) && tx.select().from(buyerPersonas).where(eq(buyerPersonas.projectId, projectId)).all().length >= 2) return { reused: true, id: null };
    if (!context.facts.length) throw new InputError("Create a company profile from saved website pages first.", 409);
    if (rows.length >= 300) throw new InputError("This library has reached its 300-question limit. Edit or restore existing questions instead.", 409);
    const keys = configuredKeys();
    if (!keys[settings.primary] && !(settings.fallback && (keys.nvidia || keys.openrouter))) throw new InputError("Question generation is temporarily unavailable. Please contact the site owner.", 503);
    const used = tx.select({ count: sql<number>`count(*)` }).from(aiUsage).where(eq(aiUsage.projectId, projectId)).get()!.count;
    if (used >= settings.requestBudget) throw new InputError("This project's analysis allowance has been reached. Please contact the site owner.", 409);
    const id = randomUUID();
    tx.insert(questionJobs).values({ id, projectId, status: "queued", settings, context: JSON.parse(redact(JSON.stringify(context))) as ResearchContext, promptVersion: QUESTION_PROMPT_VERSION, createdAt: new Date().toISOString() }).run();
    return { id, reused: false };
  }, { behavior: "immediate" });
}
export function cancelQuestionJob(projectId: string, id: string) {
  getProject(projectId);
  return database().db.transaction((tx) => {
    const job = tx.select().from(questionJobs).where(and(eq(questionJobs.id, id), eq(questionJobs.projectId, projectId))).get();
    if (!job) throw new InputError("Generation not found.", 404);
    if (["queued", "running"].includes(job.status)) tx.update(questionJobs).set({ cancelRequested: true, ...(job.status === "queued" ? { status: "cancelled" as const, completedAt: new Date().toISOString() } : {}) }).where(eq(questionJobs.id, id)).run();
    return { stopped: true };
  }, { behavior: "immediate" });
}
export function savePersona(projectId: string, id: string | undefined, input: unknown) {
  getProject(projectId);
  const data = personaFields.extend({ revision: z.number().int().positive().optional() }).strict().parse(input);
  return database().db.transaction((tx) => {
    requireIdle(tx, projectId);
    const existing = id ? tx.select().from(buyerPersonas).where(and(eq(buyerPersonas.id, id), eq(buyerPersonas.projectId, projectId))).get() : undefined;
    if (id && !existing) throw new InputError("Buyer type not found.", 404);
    if (existing && data.revision !== existing.revision) throw new InputError("This buyer type changed. Close the editor, refresh and reopen it before saving.", 409);
    if (!existing && tx.select().from(buyerPersonas).where(eq(buyerPersonas.projectId, projectId)).all().length >= 4) throw new InputError("A project supports up to four buyer types.", 409);
    const { revision: _revision, ...fields } = data;
    void _revision;
    const clean = personaFields.parse(JSON.parse(redact(JSON.stringify(fields)))), now = new Date().toISOString();
    if (existing) return tx.update(buyerPersonas).set({ ...clean, revision: existing.revision + 1, updatedAt: now, origin: "user-created", rationale: "Customized by the project owner. Original source references provide context, not proof of buyer behavior." }).where(eq(buyerPersonas.id, id!)).returning().get();
    return tx.insert(buyerPersonas).values({ ...clean, id: randomUUID(), projectId, rationale: "Added by the project owner.", sourceFactIds: [], origin: "user-created", createdAt: now, updatedAt: now }).returning().get();
  }, { behavior: "immediate" });
}
export function saveQuestion(projectId: string, id: string | undefined, input: unknown) {
  getProject(projectId);
  const data = questionFields.extend({ revision: z.number().int().positive().optional(), status: z.enum(["active", "archived"]).default("active") }).strict().parse(input);
  return database().db.transaction((tx) => {
    requireIdle(tx, projectId);
    const rows = tx.select().from(buyerQuestions).where(eq(buyerQuestions.projectId, projectId)).all(), existing = rows.find((row) => row.id === id);
    if (id && !existing) throw new InputError("Question not found.", 404);
    if (existing && existing.revision !== data.revision) throw new InputError("This question changed. Close the editor, refresh and reopen it before saving.", 409);
    if (!existing && rows.length >= 300) throw new InputError("This library has reached its 300-question limit.", 409);
    if (rows.some((row) => row.id !== id && nearDuplicate(row.text, data.text))) throw new InputError("A similar question already exists, possibly in the archive. Edit or restore that question instead.", 409);
    if (!tx.select().from(buyerPersonas).where(and(eq(buyerPersonas.id, data.personaId), eq(buyerPersonas.projectId, projectId))).get()) throw new InputError("Choose a buyer type from this project.");
    const sites = tx.select().from(brands).where(eq(brands.projectId, projectId)).all();
    const facts = tx.select().from(companyFacts).where(and(eq(companyFacts.projectId, projectId), ne(companyFacts.status, "rejected"))).all();
    if (data.expectedBrandIds.some((value) => !sites.some((site) => site.id === value)) || data.targetFactIds.some((value) => !facts.some((fact) => fact.id === value) && !existing?.targetFactIds.includes(value))) throw new InputError("Choose brands and source facts belonging to this project.");
    const { revision: _revision, status, ...fields } = data;
    void _revision;
    const clean = questionFields.parse(JSON.parse(redact(JSON.stringify(fields)))), now = new Date().toISOString();
    const values = { ...clean, normalizedText: normalizedQuestion(clean.text), status, branded: isBranded(clean.text, brandNames(researchContext(projectId))), updatedAt: now };
    if (existing) return tx.update(buyerQuestions).set({ ...values, origin: existing.text === clean.text ? existing.origin : "user-created", selected: status === "active" && existing.selected, revision: existing.revision + 1 }).where(eq(buyerQuestions.id, existing.id)).returning().get();
    return tx.insert(buyerQuestions).values({ ...values, id: randomUUID(), projectId, origin: "user-created", createdAt: now }).returning().get();
  }, { behavior: "immediate" });
}
export function selectQuestions(projectId: string, input: unknown) {
  getProject(projectId); const data = z.object({ ids: z.array(z.string().uuid()).max(20), version: z.string().length(64) }).strict().parse(input);
  return database().db.transaction((tx) => {
    requireIdle(tx, projectId);
    const rows = tx.select().from(buyerQuestions).where(eq(buyerQuestions.projectId, projectId)).all();
    if (data.version !== selectionVersion(rows)) throw new InputError("Your question library changed. Refresh before selecting questions.", 409);
    const selected = new Set(data.ids);
    if ([...selected].some((id) => !rows.some((q) => q.id === id && q.status === "active"))) throw new InputError("Select active questions from this project.");
    for (const row of rows) if (row.selected !== selected.has(row.id)) tx.update(buyerQuestions).set({ selected: selected.has(row.id), revision: row.revision + 1, updatedAt: new Date().toISOString() }).where(eq(buyerQuestions.id, row.id)).run();
    return { selected: selected.size };
  }, { behavior: "immediate" });
}
export async function experimentEstimate(projectId: string, input: unknown) {
  const { samples } = z.object({ samples: z.union([z.literal(1), z.literal(3), z.literal(5)]) }).strict().parse(input);
  getProject(projectId); const { db } = database(), settings = getSettings(projectId);
  const selected = db.select().from(buyerQuestions).where(and(eq(buyerQuestions.projectId, projectId), eq(buyerQuestions.selected, true), eq(buyerQuestions.status, "active"))).all();
  if (!selected.length) throw new InputError("Select at least one question to estimate a future run.");
  const model = await configuredModel(settings.model);
  const keys = configuredKeys(), primaryAvailable = settings.primary === "nvidia" ? model.nvidiaAvailable : model.openrouterAvailable;
  const backup = settings.primary === "nvidia" ? "openrouter" : "nvidia";
  const backupAvailable = backup === "nvidia" ? model.nvidiaAvailable : model.openrouterAvailable;
  const available = (!!keys[settings.primary] && primaryAvailable === true) || (settings.fallback && !!keys[backup] && backupAvailable === true);
  const attempts = selected.length * samples;
  const used = db.select({ count: sql<number>`count(*)` }).from(aiUsage).where(eq(aiUsage.projectId, projectId)).get()!.count;
  return { questionCount: selected.length, samples, requests: attempts, maximumAttempts: attempts * (settings.fallback ? 4 : 2),
    approximateInputTokens: Math.ceil(selected.reduce((sum, q) => sum + q.text.length + q.geography.length + 600, 0) / 4) * samples,
    maximumOutputTokens: settings.maxTokens * attempts, estimatedCostUsd: available ? 0 : null,
    withinAllowance: Math.max(0, settings.requestBudget - used) >= attempts,
    note: "Planning estimate only; nothing is run or reserved. Assumes currently listed free access, subject to availability and account limits. Input tokens use a rough characters/4 estimate. Output is a configured ceiling. Excludes answer analysis and retries from token totals. Actual cost is unknown until reported. Visibility runs arrive in Phase 5." };
}
export type ExperimentEstimate = Awaited<ReturnType<typeof experimentEstimate>>;
