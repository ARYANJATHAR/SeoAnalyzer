import { test } from "node:test";
import assert from "node:assert/strict";
import { isBranded, nearDuplicate, personaOutput, questionFields, recommendedQuestions } from "../../lib/questions/rules";
import { stages } from "../../lib/questions/types";

test("deduplication ignores punctuation, casing and conversational filler", () => {
  assert.ok(nearDuplicate("Which tools support CSV export?", "which tools support CSV export!"));
  assert.ok(nearDuplicate("What tools support CSV export?", "Which tools support CSV export?"));
});
test("deduplication retains distinct prices, regions, brands and negation", () => {
  assert.equal(nearDuplicate("Which tools cost under 20 dollars?", "Which tools cost under 50 dollars?"), false);
  assert.equal(nearDuplicate("Which tools are available in India?", "Which tools are available in Canada?"), false);
  assert.equal(nearDuplicate("Does Acme support secure CSV exports?", "Does Example support secure CSV exports?"), false);
  assert.equal(nearDuplicate("Which tools require a credit card?", "Which tools do not require a credit card?"), false);
  assert.equal(nearDuplicate("How to migrate from Acme to Example?", "How to migrate from Example to Acme?"), false);
});
test("brand matching uses name boundaries rather than arbitrary substrings", () => {
  assert.ok(isBranded("Does Acme CRM support exports?", ["Acme CRM"]));
  assert.equal(isBranded("Which scalable tools support exports?", ["Scale"]), false);
});
test("question records require explicit intent, valid references and answer needs", () => {
  const question = { text: "Which tools support CSV export?", personaId: "00000000-0000-4000-8000-000000000001", stage: "solution_research", type: "product_capability", geography: "India", intent: 3, expectedBrandIds: [], targetFactIds: [], targetFactNeeds: ["Supported export formats"] };
  assert.ok(questionFields.safeParse(question).success);
  assert.equal(questionFields.safeParse({ ...question, intent: 6 }).success, false);
  assert.equal(questionFields.safeParse({ ...question, targetFactNeeds: [] }).success, false);
  assert.equal(questionFields.safeParse({ ...question, personaId: "invented" }).success, false);
  assert.equal(questionFields.safeParse({ ...question, measuredSearchVolume: 1000 }).success, false);
});
test("persona output rejects an invented verified-customer field and invalid counts", () => {
  const persona = { role: "Operations lead", companyType: "Small SaaS company", primaryPain: "Manual reporting", purchaseCriteria: ["CSV export"], objections: ["Migration effort"], sophistication: "medium", importance: 4, rationale: "Possible buyer based on the stated use case", sourceFactIds: [] };
  assert.ok(personaOutput.safeParse({ personas: [persona, { ...persona, role: "Founder" }] }).success);
  assert.equal(personaOutput.safeParse({ personas: [persona] }).success, false);
  assert.equal(personaOutput.safeParse({ personas: [{ ...persona, verifiedCustomer: true }, persona] }).success, false);
});
test("recommendations include varied stages, personas and intent without archived rows", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i).padStart(2, "0"), stage: stages[i % stages.length], personaId: `persona-${i % 3}`, intent: i < 3 ? 2 : 5, branded: i % 2 === 0, status: "active" }));
  const selected = recommendedQuestions([...rows, { ...rows[0], id: "archived", status: "archived" }]);
  assert.equal(selected.length, 20);
  assert.equal(new Set(selected.map((q) => q.id)).size, 20);
  assert.equal(new Set(selected.map((q) => q.stage)).size, 6);
  assert.equal(new Set(selected.map((q) => q.personaId)).size, 3);
  assert.ok(selected.some((q) => q.intent <= 2));
  assert.ok(selected.some((q) => q.branded)); assert.ok(selected.some((q) => !q.branded));
  assert.ok(selected.every((q) => q.status === "active"));
});
