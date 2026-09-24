import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { database } from "../../db";
import { auditIssues, auditRuns, experimentAnswers, experiments, contentRuns, brands, buyerPersonas, buyerQuestions, companyFacts, crawlRuns, profileJobs, questionJobs, researchFlows, type ResearchFlow } from "../../db/schema";
import { getProject, saveProject } from "../../db/repositories/projects";
import { validateProject } from "../validation/project";
import { createPreview, queueCrawl, cancelCrawl } from "../crawler/service";
import { runAudit } from "../audit/service";
import { RULE_VERSION } from "../audit/engine";
import { cancelExtraction, extractionPreview, queueExtraction } from "../profile/service";
import { cancelQuestionJob, queueQuestions } from "../questions/service";
import { InputError } from "../security/url";

import { changeContent, changeExperiment, startContent, startExperiment } from "../insights/service";
import { metrics } from "../insights/metrics";
import { potentialContradictions } from "../profile/facts"; import { DEMO_ID } from "../insights/types";
const active = (status: string) => ["queued", "running"].includes(status);
export function startResearch(projectId: string, input: unknown = {}) {
  if (projectId === DEMO_ID) throw new InputError("Create your own project to run a live analysis."); getProject(projectId); const options = z.object({ refresh: z.boolean().default(false) }).strict().parse(input);
  return database().db.transaction((tx) => {
    const existing = tx.select().from(researchFlows).where(and(eq(researchFlows.projectId, projectId), eq(researchFlows.status, "running"))).get();
    if (existing) return { id: existing.id };
    const target = tx.select().from(brands).where(and(eq(brands.projectId, projectId), eq(brands.kind, "target"), eq(brands.active, true))).get();
    if (!target) throw new InputError("Add your company website first.");
    const id = randomUUID();
    tx.insert(researchFlows).values({ id, projectId, brandId: target.id, refresh: options.refresh, createdAt: new Date().toISOString() }).run();
    return { id };
  }, { behavior: "immediate" });
}
export async function quickStart(input: unknown) {
  const data = z.object({ website: z.string().trim().min(1).max(2048), name: z.string().trim().max(200).default(""), description: z.string().trim().max(1000).default(""), audience: z.string().trim().max(500).default(""), market: z.string().trim().max(160).default("") }).strict().parse(input);
  let hostname: string;
  try { hostname = new URL(/^[a-z][a-z\d+.-]*:/i.test(data.website) ? data.website : `https://${data.website}`).hostname; }
  catch { throw new InputError("Enter a valid public website address."); }
  const values = await validateProject({ name: data.name || hostname, companyName: data.name || hostname, primaryDomain: data.website, category: "Not provided", description: data.description || "Not provided", targetCustomer: data.audience || "Not provided", market: data.market || "Unspecified", pageLimit: 25, competitors: [] });
  return database().db.transaction(() => {
    const project = saveProject(values);
    startResearch(project.id);
    return { id: project.id };
  }, { behavior: "immediate" });
}
export function stopResearch(projectId: string) {
  getProject(projectId);
  return database().db.transaction((tx) => {
    const flow = tx.select().from(researchFlows).where(and(eq(researchFlows.projectId, projectId), eq(researchFlows.status, "running"))).get();
    if (!flow) return { stopped: true };
    tx.update(researchFlows).set({ status: "cancelled", completedAt: new Date().toISOString(), message: "Stopped. Everything already collected is saved." }).where(eq(researchFlows.id, flow.id)).run();
    if (flow.crawlId) cancelCrawl(flow.crawlId);
    if (flow.profileJobId) cancelExtraction(flow.profileJobId);
    if (flow.questionJobId) cancelQuestionJob(projectId, flow.questionJobId);
    if (flow.experimentId) changeExperiment(projectId, flow.experimentId, "stop");
    if (flow.contentRunId) changeContent(projectId, flow.contentRunId, "stop");
    for (const id of flow.relatedJobs.crawls) cancelCrawl(id);
    for (const id of flow.relatedJobs.profiles) cancelExtraction(id);
    return { stopped: true };
  }, { behavior: "immediate" });
}

// One short durable orchestration step per worker tick. Actual crawl and AI work
// stays in its existing queues, and survives closing or reloading the browser.
export async function advanceResearch() {
  const { db } = database(), token = randomUUID();
  const flow = db.transaction((tx) => {
    const next = tx.select().from(researchFlows).where(and(eq(researchFlows.status, "running"), lte(researchFlows.leaseUntil, Date.now()))).orderBy(asc(researchFlows.leaseUntil), asc(researchFlows.createdAt)).get();
    return next ? tx.update(researchFlows).set({ leaseToken: token, leaseUntil: Date.now() + 120000 }).where(eq(researchFlows.id, next.id)).returning().get()! : null;
  }, { behavior: "immediate" });
  if (!flow) return;
  function current() { return db.select().from(researchFlows).where(and(eq(researchFlows.id, flow!.id), eq(researchFlows.status, "running"), eq(researchFlows.leaseToken, token))).get(); }
  function update(values: Partial<Pick<ResearchFlow, "stage" | "status" | "crawlId" | "profileJobId" | "questionJobId" | "experimentId" | "contentRunId" | "relatedJobs" | "incomplete" | "message" | "completedAt">>) {
    db.update(researchFlows).set({ ...values, leaseUntil: Date.now() + 2500 }).where(and(eq(researchFlows.id, flow!.id), eq(researchFlows.status, "running"), eq(researchFlows.leaseToken, token))).run();
  }
  function end(message: string, status: "partial" | "completed" = "partial") { update({ status, message, completedAt: new Date().toISOString() }); }
  try {
    const target = db.select().from(brands).where(eq(brands.id, flow.brandId)).get();
    if (!target?.active) { end("The company website changed. Start a new analysis for the current website."); return; }
    if (flow.stage === "collecting") {
      let crawl = flow.crawlId ? db.select().from(crawlRuns).where(eq(crawlRuns.id, flow.crawlId)).get() : undefined;
      if (!crawl) {
        const recent = db.select().from(crawlRuns).where(eq(crawlRuns.brandId, flow.brandId)).orderBy(desc(crawlRuns.createdAt)).get();
        if (recent && (active(recent.status) || !flow.refresh && recent.pagesFetched > 0 || recent.createdAt >= flow.createdAt)) crawl = recent;
        else {
          const preview = await createPreview(flow.projectId, flow.brandId);
          db.transaction(() => { if (!current()) return; const queued = queueCrawl(flow.projectId, preview.id); update({ crawlId: queued.id }); }, { behavior: "immediate" }); return;
        }
        update({ crawlId: crawl.id });
      }
      if (active(crawl.status)) { update({}); return; }
      if (!crawl.pagesFetched) { end("We couldn't read useful pages from this website. Open the website details for the recorded reasons."); return; }
      runAudit(crawl.id); update({ stage: "profile", crawlId: crawl.id, incomplete: flow.incomplete || crawl.status !== "completed" }); return;
    }
    if (flow.stage === "profile") {
      const job = flow.profileJobId ? db.select().from(profileJobs).where(eq(profileJobs.id, flow.profileJobId)).get() : undefined;
      if (!job) {
        if (db.select().from(profileJobs).where(and(eq(profileJobs.projectId, flow.projectId), inArray(profileJobs.status, ["queued", "running"]))).get()) { update({}); return; }
        const preview = extractionPreview(flow.projectId, flow.crawlId!);
        if (!preview.suggestedIds.length) { end("Website checks are ready, but there isn't enough readable text to describe the company."); return; }
        db.transaction(() => { if (!current()) return; const queued = queueExtraction(flow.projectId, { crawlId: flow.crawlId, pageIds: preview.suggestedIds }); update({ profileJobId: queued.job.id }); }, { behavior: "immediate" }); return;
      }
      if (active(job.status)) { update({}); return; }
      if (job.status !== "completed" && !db.select().from(companyFacts).where(and(eq(companyFacts.brandId, flow.brandId), ne(companyFacts.status, "rejected"))).get()) { end("Website checks are saved. AI could not finish the company summary. Continue later or contact the site owner."); return; }
      update({ stage: "questions", incomplete: flow.incomplete || job.status !== "completed" }); return;
    }
    if (flow.stage === "questions") {
      const job = flow.questionJobId ? db.select().from(questionJobs).where(eq(questionJobs.id, flow.questionJobId)).get()
        : db.select().from(questionJobs).where(and(eq(questionJobs.projectId, flow.projectId), inArray(questionJobs.status, ["queued", "running"]))).get();
      if (!job) {
        db.transaction(() => { if (!current()) return; const queued = queueQuestions(flow.projectId); if (queued.reused) update({ stage: "competitors" }); else update({ questionJobId: queued.id }); }, { behavior: "immediate" }); return;
      }
      update({ questionJobId: job.id });
      if (active(job.status)) return;
      if (!db.select().from(buyerQuestions).where(and(eq(buyerQuestions.projectId, flow.projectId), eq(buyerQuestions.selected, true), eq(buyerQuestions.status, "active"))).get()) { end("The company summary is saved. Continue analysis to finish preparing buyer questions."); return; }
      update({ stage: "competitors", incomplete: flow.incomplete || job.status !== "completed" }); return;
    }
    if (flow.stage === "competitors") {
      const competitors = db.select().from(brands).where(and(eq(brands.projectId, flow.projectId), eq(brands.kind, "competitor"), eq(brands.active, true))).all();
      for (const brand of competitors) { if (flow.relatedJobs.failedBrands?.includes(brand.id)) continue;
        const crawl = db.select().from(crawlRuns).where(eq(crawlRuns.brandId, brand.id)).orderBy(desc(crawlRuns.createdAt)).get();
        if (!crawl || flow.refresh && !flow.relatedJobs.crawls.includes(crawl.id) && !active(crawl.status) && crawl.createdAt < flow.createdAt) {
          try {
            const preview = await createPreview(flow.projectId, brand.id);
            db.transaction(() => { if (!current()) return; const queued = queueCrawl(flow.projectId, preview.id); update({ relatedJobs: { ...flow.relatedJobs, crawls: [...flow.relatedJobs.crawls, queued.id] } }); }, { behavior: "immediate" });
          } catch { update({ incomplete: true, relatedJobs: { ...flow.relatedJobs, failedBrands: [...(flow.relatedJobs.failedBrands || []), brand.id] }, message: "Some competitor pages could not be collected. Continuing with available evidence." }); }
          return;
        }
        if (!flow.relatedJobs.crawls.includes(crawl.id)) { update({ relatedJobs: { ...flow.relatedJobs, crawls: [...flow.relatedJobs.crawls, crawl.id] } }); return; }
        if (active(crawl.status)) { update({}); return; }
        if (!crawl.pagesFetched) { update({ incomplete: true }); continue; }
        runAudit(crawl.id);
        const jobs = db.select().from(profileJobs).where(and(eq(profileJobs.brandId, brand.id), eq(profileJobs.crawlRunId, crawl.id))).orderBy(desc(profileJobs.createdAt)).all();
        const job = jobs.find((j) => flow.relatedJobs.profiles.includes(j.id) || !flow.refresh && j.status === "completed" || j.createdAt >= flow.createdAt || active(j.status));
        if (!job) {
          if (db.select().from(profileJobs).where(and(eq(profileJobs.projectId, flow.projectId), inArray(profileJobs.status, ["queued", "running"]))).get()) { update({}); return; }
          const preview = extractionPreview(flow.projectId, crawl.id);
          if (!preview.suggestedIds.length) { update({ incomplete: true }); continue; }
          db.transaction(() => { if (!current()) return; const queued = queueExtraction(flow.projectId, { crawlId: crawl!.id, pageIds: preview.suggestedIds }); update({ relatedJobs: { ...flow.relatedJobs, profiles: [...flow.relatedJobs.profiles, queued.job.id] } }); }, { behavior: "immediate" }); return;
        }
        if (!flow.relatedJobs.profiles.includes(job.id)) { update({ relatedJobs: { ...flow.relatedJobs, profiles: [...flow.relatedJobs.profiles, job.id] } }); return; }
        if (active(job.status)) { update({}); return; }
        if (job.status !== "completed") update({ incomplete: true });
      }
      update({ stage: "visibility" }); return;
    }
    if (flow.stage === "visibility") {
      const job = flow.experimentId ? db.select().from(experiments).where(eq(experiments.id, flow.experimentId)).get() : undefined;
      if (!job) {
        db.transaction(() => {
          if (!current()) return;
          const previous = !flow.refresh ? db.select().from(experiments).where(and(eq(experiments.projectId, flow.projectId), eq(experiments.mode, "api"))).orderBy(desc(experiments.createdAt)).get() : undefined;
          if (previous && previous.context.brands.some((b) => b.id === flow.brandId) && ["partial", "cancelled"].includes(previous.status)) { changeExperiment(flow.projectId, previous.id, "resume"); update({ experimentId: previous.id }); }
          else update({ experimentId: startExperiment(flow.projectId).id });
        }, { behavior: "immediate" }); return;
      }
      if (active(job.status)) { update({}); return; }
      update({ stage: "content", incomplete: flow.incomplete || job.status !== "completed" }); return;
    }
    if (flow.stage === "content") {
      const job = flow.contentRunId ? db.select().from(contentRuns).where(eq(contentRuns.id, flow.contentRunId)).get() : undefined;
      if (!job) {
        db.transaction(() => {
          if (!current()) return;
          const previous = !flow.refresh ? db.select().from(contentRuns).where(eq(contentRuns.projectId, flow.projectId)).orderBy(desc(contentRuns.createdAt)).get() : undefined;
          if (previous && previous.context.brands.some((b) => b.id === flow.brandId) && ["partial", "cancelled"].includes(previous.status)) { changeContent(flow.projectId, previous.id, "resume"); update({ contentRunId: previous.id }); }
          else update({ contentRunId: startContent(flow.projectId).id });
        }, { behavior: "immediate" }); return;
      }
      if (active(job.status)) { update({}); return; }
      const incomplete = flow.incomplete || job.status !== "completed";
      end(incomplete ? "Your saved results and plan are ready to explore. Some work stopped early; open the results to continue unfinished items." : "Your website findings, AI answer results and action plan are ready.", incomplete ? "partial" : "completed");
    }
  } catch { end("We saved the work completed so far. Continue analysis to retry; if it stops again, contact the site owner."); }
}

const auditLanguage: Record<string, { title: string; explanation: string }> = {
  Access: { title: "Some pages were difficult to reach", explanation: "Check the affected pages and whether visitors can open them reliably." },
  Indexability: { title: "Some page settings need attention", explanation: "Check whether the website clearly tells search engines which page versions to use." },
  Content: { title: "Some pages could explain themselves more clearly", explanation: "Page titles, short descriptions or headings may need attention." },
  Links: { title: "Some links need attention", explanation: "Check how visitors move between pages and whether their destinations work." },
  "Structured data": { title: "Some behind-the-scenes page descriptions need attention", explanation: "Check the extra information the website provides to search engines." },
};
export function researchSummary(projectId: string) {
  const project = getProject(projectId), { db } = database();
  const target = db.select().from(brands).where(and(eq(brands.projectId, projectId), eq(brands.kind, "target"), eq(brands.active, true))).get();
  const flow = target ? db.select().from(researchFlows).where(and(eq(researchFlows.projectId, projectId), eq(researchFlows.brandId, target.id))).orderBy(desc(researchFlows.createdAt)).get() : undefined;
  const crawl = target ? db.select().from(crawlRuns).where(eq(crawlRuns.brandId, target.id)).orderBy(desc(crawlRuns.createdAt)).get() : undefined;
  const audit = crawl ? db.select().from(auditRuns).where(and(eq(auditRuns.crawlRunId, crawl.id), eq(auditRuns.ruleVersion, RULE_VERSION))).get() : undefined;
  const findings = audit ? db.select().from(auditIssues).where(eq(auditIssues.auditRunId, audit.id)).all() : [];
  const attention = findings.filter((finding) => finding.severity !== "observation");
  const groups = [...new Set(attention.map((finding) => finding.category))].map((category) => {
    const rows = attention.filter((finding) => finding.category === category);
    return { category, ...(auditLanguage[category] || { title: "Some website details need attention", explanation: "Open the supporting details to see the recorded findings." }), count: rows.length, important: rows.some((row) => row.severity === "error") };
  }).sort((a, b) => Number(b.important) - Number(a.important) || b.count - a.count).slice(0, 3);
  const facts = target ? db.select().from(companyFacts).where(and(eq(companyFacts.brandId, target.id), ne(companyFacts.status, "rejected"))).orderBy(desc(companyFacts.updatedAt)).all() : [];
  const summaryFact = facts.find((fact) => ["summary", "description"].includes(fact.category));
  const customers = facts.filter((fact) => fact.category === "target_customer").slice(0, 2);
  const products = facts.filter((fact) => ["product", "feature", "use_case"].includes(fact.category)).slice(0, 3);
  const personas = db.select().from(buyerPersonas).where(eq(buyerPersonas.projectId, projectId)).all();
  const questions = db.select().from(buyerQuestions).where(and(eq(buyerQuestions.projectId, projectId), eq(buyerQuestions.status, "active"))).all();
  const experiment = target ? db.select().from(experiments).where(eq(experiments.projectId, projectId)).orderBy(desc(experiments.createdAt)).all().find((run) => run.context.brands.some((brand) => brand.kind === "target" && brand.id === target.id)) : undefined;
  const content = target ? db.select().from(contentRuns).where(eq(contentRuns.projectId, projectId)).orderBy(desc(contentRuns.createdAt)).all().find((run) => run.context.brands.some((brand) => brand.kind === "target" && brand.id === target.id)) : undefined;
  const answerMetrics = experiment ? metrics(db.select().from(experimentAnswers).where(eq(experimentAnswers.experimentId, experiment.id)).all(), experiment.context.brands) : null;
  return { project: { id: project.id, name: project.name, website: project.primaryDomain },
    outcomes: { answers: answerMetrics?.eligible || 0, mentions: answerMetrics?.target?.mention.numerator || 0,
      actions: content?.result.recommendations.length || 0, firstAction: content?.result.recommendations[0]?.title || null,
      active: !!(experiment && active(experiment.status) || content && active(content.status)) },
    flow: flow ? { id: flow.id, status: flow.status, stage: flow.stage, message: flow.message } : null,
    collection: crawl ? { pages: crawl.pagesFetched, status: crawl.status, date: crawl.createdAt, partial: crawl.status !== "completed" || crawl.pagesFailed > 0 || crawl.pagesProcessed >= crawl.settings.pageLimit } : null,
    audit: audit ? { attentionCount: attention.length, groups, limited: audit.warnings.length > 0 || audit.coverage.some((row) => row.unavailable > 0), observations: findings.length - attention.length } : null,
    company: { conflicts: potentialContradictions(facts).length, description: summaryFact?.value || null, customers: customers.map((fact) => fact.value), products: products.map((fact) => fact.value), factCount: facts.length },
    buyers: personas.map((p) => ({ role: p.role, pain: p.primaryPain })), questions: questions.filter((q) => q.selected).slice(0, 3).map((q) => q.text), questionCount: questions.length, selectedCount: questions.filter((q) => q.selected).length };
}
export type ResearchSummary = ReturnType<typeof researchSummary>;
