import test from "node:test";
import assert from "node:assert/strict";
import { csvRows, toCsv } from "../../lib/insights/csv";
import { citationsFrom, mentionPosition } from "../../lib/insights/analysis";
import { metrics, proportion } from "../../lib/insights/metrics";
import type { ExperimentAnswer } from "../../db/schema";
import type { TrackedBrand } from "../../lib/insights/types";

const brands: TrackedBrand[] = [{ id: "target", name: "Harbor", domain: "https://harbor.example.com", kind: "target", aliases: ["Harbor"] }, { id: "competitor", name: "Beacon", domain: "https://beacon.example.com", kind: "competitor", aliases: ["Beacon"] }];
function answer(id: string, overrides: Partial<ExperimentAnswer["payload"]> = {}): ExperimentAnswer {
  return { id, experimentId: "experiment", ordinal: 1, status: "completed", error: null, updatedAt: "2026-01-01",
    payload: { question: { id: "question", text: "What should a buyer compare?", stage: "vendor_comparison", type: "product_comparison", personaId: "persona", geography: "Unspecified", intent: 4 }, sample: 1, prompt: "What should a buyer compare?", raw: "Harbor is an option.", completion: null, citations: [], analysis: { entities: [], brands: [{ brandId: "target", quote: "Harbor", firstPosition: 1, recommended: true, recommendationPosition: 2, strength: "moderate", sentiment: "positive", reasons: [], limitations: [], confidence: .8, rationale: "Suggested option" }], claims: [], refused: false, refusalReason: null }, provider: "example", model: "fixture", observedAt: "2026-01-01", notes: "", truncated: false, ...overrides } };
}
test("CSV preserves multiline text and escaped quotes", () => {
  const rows = csvRows('\uFEFFprovider,question,answer,observed_at\r\nTool,Question?,"First line\nSecond, ""quoted"" line",2026-01-01');
  assert.equal(rows[0].answer, 'First line\nSecond, "quoted" line');
  assert.throws(() => csvRows('provider,question,answer,observed_at\nTool,Question?,"unclosed,2026-01-01'));
  assert.throws(() => csvRows("provider,provider,question,answer,observed_at"));
});
test("CSV export neutralizes spreadsheet formulas", () => {
  const csv = toCsv([{ title: "=SUM(1,2)", note: "\t@command", number: -1 }]);
  assert.ok(csv.includes("\"'=SUM(1,2)\""));
  assert.ok(csv.includes("\"'\t@command\""));
  assert.ok(csv.includes("\"'-1\""));
});
test("Brand names use boundaries and escape regex punctuation", () => {
  assert.equal(mentionPosition("A harboring discussion", ["Harbor"]), -1);
  assert.equal(mentionPosition("Choose HARBOR.", ["Harbor"]), 7);
  assert.equal(mentionPosition("Try C++ for this.", ["C++"]), 4);
});
test("Citations reject unsafe schemes and credential URLs and preserve provenance", () => {
  const citations = citationsFrom("See https://example.com/a and https://example.com/b.", ["https://example.com/a", "javascript:alert(1)", "http://127.0.0.1/", "https://secret@example.com/"]);
  assert.equal(citations.length, 2);
  assert.equal(citations[0].source, "provider");
  assert.equal(citations[1].source, "answer_text");
});
test("No evidence produces unavailable metrics, not zero performance", () => {
  const data = metrics([], brands);
  assert.equal(data.target?.mention.value, null);
  assert.equal(data.target?.citations.value, null);
  assert.equal(data.accuracy.value, null);
  assert.equal(proportion(0, 0).interval, null);
});
test("Refusals remain eligible; failed, truncated and unanalyzed rows are excluded", () => {
  const refusal = answer("refusal", { raw: "I cannot answer.", analysis: { entities: [], brands: [], claims: [], refused: true, refusalReason: "No information" } });
  const failed = { ...answer("failed"), status: "failed" as const };
  const data = metrics([answer("one"), refusal, failed, answer("cut", { truncated: true }), answer("unanalyzed", { analysis: null })], brands);
  assert.equal(data.eligible, 2);
  assert.equal(data.excluded, 3);
  assert.equal(data.refusals, 1);
  assert.equal(data.target?.mention.value, .5);
  assert.equal(data.target?.position, 2);
  assert.equal(data.target?.absent, 1);
});
test("Citation denominator is answers with links, and domain matching resists suffix spoofing", () => {
  const data = metrics([answer("one", { citations: [{ url: "https://harbor.example.com/source", domain: "harbor.example.com", source: "provider" }] }), answer("two"), answer("three", { citations: [{ url: "https://harbor.example.com.evil.example/", domain: "harbor.example.com.evil.example", source: "answer_text" }] })], brands);
  assert.equal(data.target?.citations.numerator, 1);
  assert.equal(data.target?.citations.denominator, 2);
});
test("Accuracy excludes unknown and time-sensitive claims", () => {
  const row = answer("one");
  row.payload.analysis!.claims = (["supported", "contradicted", "unverifiable", "time_sensitive"] as const).map((classification) => ({ text: "Claim", quote: "Claim", classification, factIds: [], confidence: .8, rationale: "Fixture" }));
  const data = metrics([row], brands);
  assert.equal(data.accuracy.value, .5);
  assert.equal(data.accuracy.denominator, 2);
  assert.equal(data.unverifiedClaims, 1);
  assert.equal(data.timeSensitiveClaims, 1);
});
test("Weighted share counts one mention per answer and never treats absence as last rank", () => {
  const row = answer("one");
  row.payload.analysis!.brands.push({ ...row.payload.analysis!.brands[0], brandId: "competitor", recommendationPosition: null, recommended: false });
  const data = metrics([row], brands);
  assert.equal(data.brands[0].weighted, 3);
  assert.equal(data.brands[0].share, .5);
  assert.equal(data.brands[1].position, null);
});
test("Wilson intervals are bounded, with tiny samples labeled directional", () => {
  assert.equal(proportion(1, 1).confidence, "Directional result");
  const full = proportion(20, 20);
  assert.ok(full.interval && full.interval[0] > .8 && full.interval[1] <= 1);
});

