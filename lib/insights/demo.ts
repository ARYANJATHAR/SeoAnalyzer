import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { database } from "../../db";
import { brands, buyerPersonas, buyerQuestions, companyFacts, contentRuns, crawlRuns, experimentAnswers, experiments, pages, projects, type Page } from "../../db/schema";
import { buildContentResult, deterministicPage } from "./content";
import { DEMO_ID, type Analysis, type ContentContext, type ExperimentContext, type Question, type TrackedBrand } from "./types";
import { normalizedQuestion } from "../questions/rules";

// Entire fixture is fictional. No network or AI request is made here.
export function seedDemo() {
  const { db } = database();
  return db.transaction((tx) => {
    if (tx.select().from(projects).where(eq(projects.id, DEMO_ID)).get()) return { id: DEMO_ID };
    const now = new Date().toISOString(), earlier = new Date(Date.now() - 30 * 86400000).toISOString();
    tx.insert(projects).values({ id: DEMO_ID, name: "Harbor — demonstration", companyName: "Harbor", primaryDomain: "https://harbor.example.com", category: "Support software", description: "Fictional support workspace for small software teams.", targetCustomer: "Small software support teams", market: "Unspecified", conversionEvent: "trial", brandAliases: ["Harbor"], productNames: ["Harbor"], pageLimit: 25, excludedPaths: [], createdAt: earlier, updatedAt: now }).run();
    const tracked: TrackedBrand[] = [{ id: randomUUID(), name: "Harbor", domain: "https://harbor.example.com", kind: "target", aliases: ["Harbor"] }, { id: randomUUID(), name: "Beacon", domain: "https://beacon.example.com", kind: "competitor", aliases: ["Beacon"] }];
    for (const b of tracked) tx.insert(brands).values({ id: b.id, projectId: DEMO_ID, name: b.name, domain: b.domain, kind: b.kind, createdAt: earlier }).run();
    const personaId = randomUUID();
    tx.insert(buyerPersonas).values({ id: personaId, projectId: DEMO_ID, role: "Support lead", companyType: "Small software company", primaryPain: "Questions arrive through several channels.", purchaseCriteria: ["Clear routing", "Setup effort"], objections: ["Unclear pricing"], sophistication: "medium", importance: 4, rationale: "Fictional demonstration persona.", sourceFactIds: [], origin: "generated", createdAt: earlier, updatedAt: now }).run();
    const texts = ["Which support tools help small software teams route requests?", "What should a support lead compare before choosing a shared inbox?", "How can a small support team reduce duplicate replies?", "Which support tools connect to Slack?", "What evidence should I ask for before choosing support software?", "How does Harbor route incoming questions?", "Does Harbor support Slack notifications?", "What does Harbor cost for a growing team?", "How does Harbor compare with Beacon?", "What are the alternatives to Beacon for a small support team?", "What security details should a support vendor publish?", "How long does it take to set up a shared support inbox?", "How do I migrate an existing help desk?", "Which support tools have simple assignment rules?", "What reporting helps a support manager improve response time?", "Which shared inbox fits a five-person team?", "Can Harbor help with customer onboarding questions?", "Where can I find customer evidence for Harbor?", "How should I evaluate a support-software trial?", "What should I check before buying support software?"];
    const questions: Question[] = texts.map((text, i) => ({ id: randomUUID(), text, stage: i < 4 ? "category_education" : i < 10 ? "vendor_comparison" : i < 16 ? "validation_risk" : "purchase_decision", type: i === 3 || i === 6 ? "integration" : i === 7 ? "pricing" : "category_recommendation", personaId, geography: "Unspecified", intent: i < 4 ? 2 : 4 }));
    for (const q of questions) tx.insert(buyerQuestions).values({ ...q, projectId: DEMO_ID, normalizedText: normalizedQuestion(q.text), expectedBrandIds: tracked.map((b) => b.id), targetFactIds: [], targetFactNeeds: ["Fictional product evidence for this demonstration"], branded: /Harbor|Beacon/.test(q.text), origin: "generated", selected: true, createdAt: earlier, updatedAt: now }).run();
    const collected: Page[] = [];
    const collectedRuns: ContentContext["crawls"] = [];
    for (const b of tracked) {
      const id = randomUUID(), discovery = { origin: b.domain, robotsUrl: b.domain + "/robots.txt", robotsStatus: 200, robotsText: "# Synthetic demonstration", rootAllowed: true, sitemapUrls: [], pageUrls: [b.domain + "/", b.domain + "/integrations/slack"], warnings: ["Synthetic demonstration; no website was fetched."], truncated: false, discoveredAt: now };
      tx.insert(crawlRuns).values({ id, projectId: DEMO_ID, brandId: b.id, status: "completed", settings: { pageLimit: 25, excludedPaths: [] }, discovery, pagesDiscovered: 2, pagesProcessed: 2, pagesFetched: 2, createdAt: now, completedAt: now }).run();
      collectedRuns.push({ id, brandId: b.id, createdAt: now, status: "completed", pagesFetched: 2 });
      for (const path of ["/", "/integrations/slack"]) {
        const text = path === "/" ? b.name + " is a fictional support workspace for small software teams. It routes customer questions to teammates using assignment rules. This is synthetic demo content." : b.name + " supports Slack notifications for assigned support requests in this fictional demonstration. Setup instructions and limitations belong on the integration page.";
        const page = tx.insert(pages).values({ id: randomUUID(), crawlRunId: id, brandId: b.id, url: b.domain + path, finalUrl: b.domain + path, canonicalUrl: b.domain + path, status: "fetched", statusCode: 200, contentType: "text/html", title: b.name + (path === "/" ? " support workspace" : " Slack integration"), metaDescription: text.slice(0, 150), headings: [{ level: 1, text: b.name }, { level: 2, text: "How it works" }], visibleText: text, textHash: createHash("sha256").update(text).digest("hex"), wordCount: text.split(/\s+/).length, language: "en", internalLinks: [b.domain + "/"], externalLinks: [], structuredData: [{ valid: true, value: { "@type": "SoftwareApplication", name: b.name } }], robotsDirectives: [], redirects: [], inSitemap: true, fetchedAt: now,
          technicalSignals: { version: 1, pageKind: path === "/" ? "home" : "product", canonicalCandidates: [{ raw: b.domain + path, url: b.domain + path }], authors: [], publishedDates: [], modifiedDates: [], contactSignals: [], identitySignals: [b.name], scriptCount: 0, javascriptNotice: null, mainText: text } }).returning().get()!;
        collected.push(page);
      }
    }
    const source = collected[0];
    const fact = tx.insert(companyFacts).values({ id: randomUUID(), projectId: DEMO_ID, brandId: tracked[0].id, category: "summary", subject: "Harbor", attribute: "description", value: "Harbor is a fictional support workspace for small software teams.", confidence: 1, sources: [{ pageId: source.id, url: source.url, quote: "Harbor is a fictional support workspace for small software teams.", fetchedAt: now, textHash: source.textHash }], origin: "model", status: "unreviewed", createdAt: now, updatedAt: now }).returning().get()!;
    const references = [{ id: fact.id, brandId: fact.brandId, category: fact.category, subject: fact.subject, attribute: fact.attribute, value: fact.value, sources: fact.sources }];
    const context: ExperimentContext = { brands: tracked, facts: references, questions, samples: 1, settings: null, promptVersion: "synthetic-demo-v1", promptHash: "synthetic-demo-questions-v1" };
    for (const [cycle, date] of [[0, earlier], [1, now]] as const) {
      const id = randomUUID();
      tx.insert(experiments).values({ id, projectId: DEMO_ID, mode: "demo", context, status: "completed", createdAt: date, completedAt: date }).run();
      questions.forEach((q, i) => {
        const named = i < (cycle ? 16 : 12);
        const raw = named ? "Synthetic demo answer. Harbor is a fictional support workspace for small software teams. 1. Harbor helps route requests. 2. Beacon is another option. Example source: https://harbor.example.com/" : "Synthetic demo answer. Beacon is an option to compare for a shared inbox. Check product capabilities and current pricing. Example source: https://beacon.example.com/";
        const present = named ? tracked : [tracked[1]];
        const analysis: Analysis = { entities: present.map((b) => ({ name: b.name, quote: b.name })), brands: present.map((b, index) => ({ brandId: b.id, quote: b.name, firstPosition: index + 1, recommended: true, recommendationPosition: index + 1, strength: "moderate", sentiment: "positive", reasons: ["Synthetic example for the product tour"], limitations: [], confidence: 1, rationale: "Hand-authored demonstration; not an AI judgment." })), claims: named ? [{ text: fact.value, quote: fact.value, classification: "supported", factIds: [fact.id], confidence: 1, rationale: "Matches the synthetic website fixture." }] : [], refused: false, refusalReason: null };
        const domain = named ? "harbor.example.com" : "beacon.example.com";
        tx.insert(experimentAnswers).values({ id: randomUUID(), experimentId: id, ordinal: i, status: "completed", updatedAt: date, payload: { question: q, sample: 1, prompt: q.text, raw, completion: null, citations: [{ url: "https://" + domain + "/", domain, source: "answer_text" }], analysis, provider: "Synthetic demonstration", model: "Hand-authored fixture", observedAt: date, notes: "Not an actual model response or website measurement.", truncated: false } }).run();
      });
    }
    const contentContext: ContentContext = { brands: tracked, facts: references, questions, pages: collected, issues: [], crawls: collectedRuns, settings: null };
    const findings = collected.map((p) => {
      const out = deterministicPage(p, contentContext), integration = p.url.includes("slack");
      out.matches = questions.filter((q, i) => integration ? q.type === "integration" : i < (p.brandId === tracked[0].id ? 3 : 5)).map((q) => ({ questionId: q.id, quote: p.visibleText!, reason: "Synthetic demonstration match." }));
      out.topic = integration ? "Slack notifications" : "Support request routing"; out.status = "completed";
      for (const c of out.components.filter((c) => c.method === "AI")) { c.points = c.weight * .75; c.reason = "Synthetic demonstration judgment, not an AI result."; c.quote = p.visibleText!; c.confidence = 1; }
      out.score = Math.round(out.components.reduce((s, c) => s + (c.points || 0), 0)); out.evaluatedWeight = out.components.filter((c) => c.points !== null).reduce((s, c) => s + c.weight, 0);
      return out;
    });
    tx.insert(contentRuns).values({ id: randomUUID(), projectId: DEMO_ID, context: contentContext, result: buildContentResult(contentContext, findings, tx.select().from(experimentAnswers).where(eq(experimentAnswers.experimentId, tx.select().from(experiments).where(eq(experiments.projectId, DEMO_ID)).all().find((r) => r.createdAt === now)!.id)).all()), status: "completed", createdAt: now, completedAt: now }).run();
    return { id: DEMO_ID };
  }, { behavior: "immediate" });
}

