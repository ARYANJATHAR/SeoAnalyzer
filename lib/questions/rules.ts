import { z } from "zod";
import { stages, questionTypes } from "./types";

const short = z.string().trim().min(1).max(240);
const list = z.array(short).min(1).max(5);
export const personaFields = z.object({ role: short, companyType: short, primaryPain: z.string().trim().min(1).max(600), purchaseCriteria: list, objections: list, sophistication: z.enum(["low", "medium", "high"]), importance: z.number().int().min(1).max(5) }).strict();
export const personaOutput = z.object({ personas: z.array(personaFields.extend({ rationale: z.string().trim().min(1).max(600), sourceFactIds: z.array(z.string().uuid()).max(6) }).strict()).min(2).max(4) }).strict();
export const questionFields = z.object({ text: z.string().trim().min(12).max(600), personaId: z.string().uuid(), stage: z.enum(stages), type: z.enum(questionTypes), geography: z.string().trim().min(1).max(160), intent: z.number().int().min(1).max(5), expectedBrandIds: z.array(z.string().uuid()).max(4), targetFactIds: z.array(z.string().uuid()).max(8), targetFactNeeds: z.array(short).min(1).max(5) }).strict();
export const questionOutput = z.object({ questions: z.array(questionFields).min(1).max(10) }).strict();

export function normalizedQuestion(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
export function nearDuplicate(a: string, b: string) {
  const left = normalizedQuestion(a), right = normalizedQuestion(b);
  if (left === right) return true;
  // Remove conversational wording only. Preserve brands, regions, amounts,
  // negation and word order so distinct comparisons/directions are not merged.
  const filler = new Set(["a", "an", "the", "what", "which", "is", "are", "can", "could", "would", "i", "we", "our", "do", "does", "please", "some", "me", "you", "your", "tell", "about"]);
  const meaningful = (value: string) => value.split(" ").filter((word) => !filler.has(word)).join(" ");
  const core = meaningful(left);
  return core.length > 0 && core === meaningful(right);
}
export function isBranded(text: string, names: string[]) {
  const question = ` ${normalizedQuestion(text)} `;
  return names.some((name) => { const value = normalizedQuestion(name); return value.length > 1 && question.includes(` ${value} `); });
}
type Selectable = { id: string; intent: number; stage: string; personaId: string; branded: boolean; status: string };
export function recommendedQuestions<T extends Selectable>(questions: T[], limit = 20): T[] {
  const candidates = questions.filter((q) => q.status === "active").sort((a, b) => b.intent - a.intent || a.id.localeCompare(b.id));
  const selected: T[] = [];
  const add = (q: T | undefined) => { if (q && selected.length < limit && !selected.some((old) => old.id === q.id)) selected.push(q); };
  // Ensure useful breadth before filling with the strongest commercial intent.
  for (const stage of stages) add(candidates.find((q) => q.stage === stage));
  for (const personaId of new Set(candidates.map((q) => q.personaId))) add(candidates.find((q) => q.personaId === personaId));
  add(candidates.find((q) => q.branded)); add(candidates.find((q) => !q.branded));
  add(candidates.find((q) => q.intent <= 2));
  for (const question of candidates) add(question);
  return selected;
}
