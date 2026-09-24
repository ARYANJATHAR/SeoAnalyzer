import { desc, eq, inArray } from "drizzle-orm";
import { database } from "../../db";
import { auditIssues, auditRuns, brands, buyerPersonas, buyerQuestions, companyFacts, contentRuns, crawlRuns, experimentAnswers, experiments, pages } from "../../db/schema";
import { getProject } from "../../db/repositories/projects";
import { InputError } from "../security/url";
import { redact } from "../ai/config";
import { insightSnapshot } from "./service";
import { toCsv } from "./csv";
import { DEMO_ID } from "./types";
export function projectExport(projectId: string) {
  const project = getProject(projectId), { db } = database();
  const runs = db.select().from(experiments).where(eq(experiments.projectId, projectId)).orderBy(desc(experiments.createdAt)).all();
  const content = db.select().from(contentRuns).where(eq(contentRuns.projectId, projectId)).orderBy(desc(contentRuns.createdAt)).all();
  const audits = db.select().from(auditRuns).where(eq(auditRuns.projectId, projectId)).all();
  const crawls = db.select().from(crawlRuns).where(eq(crawlRuns.projectId, projectId)).all();
  return { version: 1, exportedAt: new Date().toISOString(), demonstration: projectId === DEMO_ID, project,
    brands: db.select().from(brands).where(eq(brands.projectId, projectId)).all(),
    personas: db.select().from(buyerPersonas).where(eq(buyerPersonas.projectId, projectId)).all(),
    questions: db.select().from(buyerQuestions).where(eq(buyerQuestions.projectId, projectId)).all(),
    facts: db.select().from(companyFacts).where(eq(companyFacts.projectId, projectId)).all(), audits,
    issues: audits.length ? db.select().from(auditIssues).where(inArray(auditIssues.auditRunId, audits.map((r) => r.id))).all() : [],
    crawls: crawls.map((run) => Object.fromEntries(Object.entries(run).filter(([key]) => key !== "workerId" && key !== "heartbeatAt"))),
    pages: crawls.length ? db.select().from(pages).where(inArray(pages.crawlRunId, crawls.map((r) => r.id))).all() : [],
    experiments: runs.map((r) => ({ id: r.id, mode: r.mode, status: r.status, createdAt: r.createdAt, completedAt: r.completedAt, context: { ...r.context, settings: null }, answers: db.select().from(experimentAnswers).where(eq(experimentAnswers.experimentId, r.id)).all().map(({ payload, ...a }) => ({ ...a, payload: { ...payload, completion: payload.completion ? { ...payload.completion, ledgerId: "", upstream: null } : null } })) })),
    content: content.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt, completedAt: r.completedAt, context: { ...r.context, settings: null }, result: r.result })),
    limitations: "Local research backup; no secrets, request ledger or owner configuration. Restoring a backup is not automated. Synthetic demo records are not measurements. Public source claims and model judgments can be wrong." };
}
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const pct = (value: number | null) => value === null ? "Unavailable" : Math.round(value * 100) + "%";
export function printableReport(projectId: string) {
  const data = insightSnapshot(projectId), m = data.metrics, result = data.content?.result;
  const table = (headers: string[], rows: unknown[][]) => "<table><thead><tr>" + headers.map((h) => "<th>" + esc(h) + "</th>").join("") + "</tr></thead><tbody>" + rows.map((r) => "<tr>" + r.map((c) => "<td>" + esc(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  const actions = (month: number) => (result?.recommendations || []).filter((r) => r.month === month).map((r) => "<article><h3>" + esc(r.title) + "</h3><p>" + esc(r.reason) + "</p><p>Owner: " + esc(r.owner) + " · Effort: " + esc(r.effort) + " · Priority: " + r.priority + "/100</p><p>Evidence: " + esc(r.evidence.join("; ")) + "</p><p>Pages: " + esc(r.urls.join("; ")) + "</p><p>Expected result: " + esc(r.expectedResult) + "</p><ul>" + r.acceptance.map((a) => "<li>" + esc(a) + "</li>").join("") + "</ul></article>").join("") || "<p>No saved actions for this month.</p>";
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(data.project.name) + ' — AnswerLens report</title><style>body{font:16px/1.6 system-ui;color:#292929;background:#edede8;margin:0}main{max-width:960px;margin:auto;padding:48px;background:white}h1,h2,h3{font-weight:400}h1{font-size:40px}h2{margin-top:36px}p,li{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:10px;text-align:left;border-bottom:1px solid #ccc;overflow-wrap:anywhere}article{border-top:1px solid #ddd;padding:12px 0}aside{padding:16px;background:#edede8}a{color:inherit}@media print{body,main{background:white}main{max-width:none;padding:0}.no-print{display:none}h2,h3{break-after:avoid}article,tr{break-inside:avoid}thead{display:table-header-group}@page{margin:18mm}}</style></head><body><main>' +
    '<p class="no-print"><a href="/projects/' + esc(projectId) + '/reports">Back to AnswerLens</a> · Use your browser’s Print command to save as PDF.</p>' +
    (data.demo ? "<aside>DEMONSTRATION — all sample content and answers are synthetic. No live performance is represented.</aside>" : "") +
    "<h1>" + esc(data.project.name) + "</h1><p>Website and AI answer research · " + esc(new Date().toISOString()) + "</p>" +
    "<h2>1. Coverage</h2><p>" + esc(data.run ? data.run.mode + " check, " + data.run.status + ", started " + data.run.createdAt : "No saved visibility check") + ". " + m.eligible + " eligible answers; " + m.excluded + " excluded.</p><p>Observed systems: " + esc(m.scopes.join("; ") || "None") + ".</p>" +
    "<h2>2. Executive summary</h2><p>" + (m.target ? "Your brand appears in " + m.target.mention.numerator + " of " + m.target.mention.denominator + " eligible answers." : "No eligible answers yet.") + " " + (result?.gaps.length || 0) + " possible content gaps were identified in the analyzed excerpts.</p>" +
    "<h2>3. Visibility and competitors</h2>" + table(["Brand", "Mention", "Recommendation", "Citation", "Weighted share", "Recommendation position"], m.brands.map((b) => [b.name, pct(b.mention.value) + " (" + b.mention.numerator + "/" + b.mention.denominator + ")", pct(b.recommendation.value) + " (" + b.recommendation.numerator + "/" + b.recommendation.denominator + ")", pct(b.citations.value) + " (" + b.citations.numerator + "/" + b.citations.denominator + ")", pct(b.share) + " (" + b.weighted + "/" + b.shareDenominator + ")", b.position === null ? "Unavailable" : b.position.toFixed(1) + " across " + b.positionSamples + " lists"])) +
    "<h2>4. Agreement with website claims</h2><p>" + pct(m.accuracy.value) + " supported (" + m.accuracy.numerator + "/" + m.accuracy.denominator + " verifiable claims). " + m.unverifiedClaims + " unverifiable; " + m.timeSensitiveClaims + " time-sensitive. This compares against website claims, not independently confirmed truth.</p>" +
    table(["Question", "Claim", "Classification", "Rationale", "Fact references"], data.answers.flatMap((a) => (a.analysis?.claims || []).map((c) => [a.question.text, c.quote, c.classification, c.rationale, c.factIds.join(", ")]))) +
    "<h2>5. Citation sources</h2>" + table(["Domain", "URL occurrences", "Source type"], m.citationDomains.map((d) => [d.domain, d.count, d.sourceKinds.join(", ")])) + "<p>Top five domains: " + pct(m.concentration.value) + " (" + m.concentration.numerator + "/" + m.concentration.denominator + " URL occurrences). URLs have not been verified or fetched.</p>" +
    "<h2>6. Website and content</h2>" + table(["Page", "Readiness points", "Topic"], (result?.pages || []).map((p) => [p.url, p.score + "/" + p.evaluatedWeight + " evaluated points", p.topic])) +
    table(["Buyer question", "Finding", "Target evidence", "Competitor evidence"], (result?.gaps || []).map((g) => [g.question, g.reason, (g.targetUrls.length ? g.targetUrls : g.checkedTargetUrls).join("; "), g.competitorUrls.join("; ")])) +
    "<h2>7. Highest-priority actions</h2>" + table(["Action", "Priority", "Owner", "Effort"], (result?.recommendations || []).slice(0, 5).map((r) => [r.title, r.priority + "/100", r.owner, r.effort])) +
    "<h2>8. First 30 days</h2>" + actions(1) + "<h2>9. Days 31–60</h2>" + actions(2) + "<h2>Days 61–90</h2>" + actions(3) + "<p>Suggested repeat-check date: " + esc(result?.repeatOn || "After establishing a baseline") + ".</p>" +
    "<h2>10. Methodology and limitations</h2><p>" + esc(m.warning) + "</p><p>Weights by buyer stage: " + esc(JSON.stringify(m.stageWeights)) + ". Share of voice divides weighted mentions by weighted mentions of all tracked brands. Absence is excluded from recommendation position, not assigned a last rank.</p><p>Wilson intervals are displayed for at least ten eligible answers in the app; smaller samples are directional. Question mixes, manual imports and different served models are not controlled comparisons. No causal or ranking guarantee is made.</p><ul>" + (result?.coverage || ["No content analysis saved."]).map((c) => "<li>" + esc(c) + "</li>").join("") + "</ul><p>Priority weights: commercial impact 35%, visibility gap 25%, confidence 15%, strategic relevance 15%, ease 10%. Exports include reproducible evidence and individual scores.</p></main></body></html>";
}
export function exportResponse(projectId: string, kind: string) {
  let body: string, type: string, extension: string;
  if (kind === "report") { body = printableReport(projectId); type = "text/html; charset=utf-8"; extension = "html"; }
  else {
    const data = projectExport(projectId);
    if (kind === "json") { body = JSON.stringify(data, null, 2); type = "application/json; charset=utf-8"; extension = "json"; }
    else {
      const rows: Record<string, unknown>[] = kind === "questions" ? data.questions : kind === "facts" ? data.facts : kind === "issues" ? data.issues : kind === "recommendations" ? data.content[0]?.result.recommendations || [] :
        kind === "results" ? data.experiments.flatMap((run) => run.answers.map((a) => ({ experiment_id: run.id, mode: run.mode, status: a.status, ...a.payload, demonstration: data.demonstration }))) : [];
      if (!["questions", "facts", "issues", "recommendations", "results"].includes(kind)) throw new InputError("Export format not found.", 404);
      body = toCsv(rows); type = "text/csv; charset=utf-8"; extension = "csv";
    }
  }
  return new Response(redact(body), { headers: { "Content-Type": type, "Content-Disposition": (kind === "report" ? "inline" : "attachment") + '; filename="answerlens-' + kind + '.' + extension + '"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(kind === "report" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" } : {}) } });
}

