import { test } from "node:test";
import assert from "node:assert/strict";
import type { CompanyFact, Page } from "../../db/schema";
import { extractionSchema, factSource, potentialContradictions, sourceText, supportedQuote } from "../../lib/profile/facts";
import { isFreeTextModel } from "../../lib/ai/catalog";
import { sharedModels } from "../../lib/ai/models";
import { settingsSchema, defaults, redact } from "../../lib/ai/config";
const collectedAt = "2026-09-17T12:00:00.000Z";
const savedPage = { id: "page", url: "https://example.com/product", finalUrl: null, visibleText: "Example offers a monthly Starter plan for $20. The product supports CSV exports.", fetchedAt: collectedAt, textHash: "hash" } as Page;
const proposal = { category: "pricing", subject: "Example", attribute: "starter_usd_monthly", value: "$20", confidence: 0.8, quote: "Example offers a monthly Starter plan for $20." };
function fact(id: string, value: string, changes: Partial<CompanyFact> = {}): CompanyFact {
  return { id, projectId: "project", brandId: "brand", jobId: "job", category: "pricing", subject: "Example", attribute: "starter_usd_monthly", value, confidence: 0.8, sources: [factSource(savedPage, proposal.quote)], status: "unreviewed", origin: "model", reviewNote: "", revision: 1, createdAt: collectedAt, updatedAt: collectedAt, reviewedAt: null, ...changes };
}
test("model output must follow the bounded fact schema", () => {
  assert.ok(extractionSchema.safeParse({ facts: [proposal] }).success);
  assert.ok(extractionSchema.safeParse({ facts: [] }).success);
  assert.equal(extractionSchema.safeParse({ facts: [{ ...proposal, confidence: 1.5 }] }).success, false);
  assert.equal(extractionSchema.safeParse({ facts: [{ ...proposal, execute: "instructions" }] }).success, false);
  assert.equal(extractionSchema.safeParse({ facts: Array(13).fill(proposal) }).success, false);
});
test("quotes must be present in the sent source and retain provenance", () => {
  assert.ok(supportedQuote(savedPage, proposal.quote));
  assert.equal(supportedQuote(savedPage, "Example is certified to an unsupported standard."), false);
  const source = factSource(savedPage, proposal.quote);
  assert.equal(source.pageId, "page"); assert.equal(source.fetchedAt, collectedAt); assert.equal(source.textHash, "hash");
});
test("quotes beyond the sent excerpt are not accepted by extraction", () => {
  const page = { ...savedPage, visibleText: `${"a".repeat(8000)} This unique sentence was never sent to the provider.` };
  assert.equal(sourceText(page).length, 8000);
  assert.equal(supportedQuote(page, "This unique sentence was never sent to the provider."), false);
});
test("contradictions retain both sides rather than choosing a winner", () => {
  const groups = potentialContradictions([fact("a", "$20", { status: "confirmed" }), fact("b", "$25")]);
  assert.equal(groups.length, 1); assert.deepEqual(groups[0].factIds, ["a", "b"]);
});
test("different brands, attributes and rejected facts do not create conflicts", () => {
  assert.equal(potentialContradictions([fact("a", "$20"), fact("b", "$25", { brandId: "competitor" })]).length, 0);
  assert.equal(potentialContradictions([fact("a", "$20"), fact("b", "$25", { attribute: "pro_usd_monthly" })]).length, 0);
  assert.equal(potentialContradictions([fact("a", "$20"), fact("b", "$25", { status: "rejected" })]).length, 0);
  assert.equal(potentialContradictions([fact("a", "$20"), fact("b", " $20 ")]).length, 0);
});
test("free-model eligibility requires explicit zero prices and text output", () => {
  const model = { id: "test:free", pricing: { prompt: "0", completion: "0" }, architecture: { output_modalities: ["text"] } };
  assert.equal(isFreeTextModel(model), true);
  assert.equal(isFreeTextModel({ ...model, pricing: { prompt: "0", completion: "0.1" } }), false);
  assert.equal(isFreeTextModel({ ...model, pricing: { prompt: "0", completion: "0", request: "0.01" } }), false);
  assert.equal(isFreeTextModel({ ...model, pricing: {} }), false);
  assert.equal(isFreeTextModel({ ...model, architecture: { output_modalities: ["audio"] } }), false);
});
test("configured models use explicit free routes and bounded settings", () => {
  assert.equal(new Set(sharedModels.map((model) => model.id)).size, sharedModels.length);
  assert.ok(sharedModels.every((model) => model.openrouter.endsWith(":free")));
  assert.ok(settingsSchema.safeParse(defaults).success);
  assert.equal(settingsSchema.safeParse({ ...defaults, requestBudget: 0 }).success, false);
  assert.equal(settingsSchema.safeParse({ ...defaults, model: "paid-model" }).success, false);
  assert.equal(settingsSchema.safeParse({ ...defaults, apiKey: "must-not-be-stored" }).success, false);
});
test("known server keys are redacted before text is saved", () => {
  const before = process.env.NVIDIA_API_KEY;
  try { process.env.NVIDIA_API_KEY = "dummy-test-key-not-a-credential"; assert.equal(redact("value dummy-test-key-not-a-credential"), "value [REDACTED]"); }
  finally { if (before === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = before; }
});
