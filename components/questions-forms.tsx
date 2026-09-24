"use client";
import { useState } from "react";
import type { BuyerPersona, BuyerQuestion } from "@/db/schema";
import type { QuestionSnapshot } from "@/lib/questions/service";
import { stageLabels, stages, questionTypes, pretty, type JourneyStage, type QuestionType } from "@/lib/questions/types";
import { api } from "@/lib/client";

const lines = (value: string[]) => value.map((line) => line.trim()).filter(Boolean);
export function PersonaForm({ projectId, persona, onSaved, onCancel }: { projectId: string; persona?: BuyerPersona; onSaved: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState({ role: persona?.role || "", companyType: persona?.companyType || "", primaryPain: persona?.primaryPain || "", purchaseCriteria: persona?.purchaseCriteria || [""], objections: persona?.objections || [""], sophistication: persona?.sophistication || "medium", importance: persona?.importance || 3 });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(`/api/projects/${projectId}/personas${persona ? `/${persona.id}` : ""}`, { method: persona ? "PATCH" : "POST", body: JSON.stringify({ ...draft, purchaseCriteria: lines(draft.purchaseCriteria), objections: lines(draft.objections), ...(persona ? { revision: persona.revision } : {}) }) }); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : "Couldn't save this buyer type."); } finally { setBusy(false); }
  }
  return <form className="panel question-editor" onSubmit={save}><h3>{persona ? "Edit buyer type" : "Add a buyer type"}</h3><div className="profile-form-grid">
    <label>Role<input required maxLength={240} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} /></label>
    <label>Company type<input required maxLength={240} value={draft.companyType} onChange={(e) => setDraft({ ...draft, companyType: e.target.value })} /></label>
    <label className="full-width">Main problem<textarea required maxLength={600} value={draft.primaryPain} onChange={(e) => setDraft({ ...draft, primaryPain: e.target.value })} /></label>
    <label>Purchase criteria (one per line, up to 5)<textarea required value={draft.purchaseCriteria.join("\n")} maxLength={1204} onChange={(e) => setDraft({ ...draft, purchaseCriteria: e.target.value.split("\n") })} /></label>
    <label>Likely objections (one per line, up to 5)<textarea required value={draft.objections.join("\n")} maxLength={1204} onChange={(e) => setDraft({ ...draft, objections: e.target.value.split("\n") })} /></label>
    <label>Technical familiarity<select value={draft.sophistication} onChange={(e) => setDraft({ ...draft, sophistication: e.target.value as BuyerPersona["sophistication"] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
    <label>Commercial importance (1–5)<input type="number" min={1} max={5} required value={draft.importance} onChange={(e) => setDraft({ ...draft, importance: Number(e.target.value) })} /></label>
  </div>{error && <p role="alert" className="notice">{error}</p>}<div className="actions"><button className="button primary small" disabled={busy}>{busy ? "Saving…" : "Save buyer type"}</button><button className="button ghost small" type="button" disabled={busy} onClick={onCancel}>Cancel</button></div></form>;
}

export function QuestionForm({ projectId, question, data, onSaved, onCancel }: { projectId: string; question?: BuyerQuestion; data: QuestionSnapshot; onSaved: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState({ text: question?.text || "", personaId: question?.personaId || data.personas[0]?.id || "", stage: question?.stage || "solution_research" as JourneyStage, type: question?.type || "product_capability" as QuestionType, geography: question?.geography || data.project.market.slice(0, 160) || "Unspecified", intent: question?.intent || 3, expectedBrandIds: question?.expectedBrandIds || [], targetFactIds: question?.targetFactIds || [], targetFactNeeds: question?.targetFactNeeds || [""] });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(`/api/projects/${projectId}/questions${question ? `/${question.id}` : ""}`, { method: question ? "PATCH" : "POST", body: JSON.stringify({ ...draft, targetFactNeeds: lines(draft.targetFactNeeds), status: question?.status || "active", ...(question ? { revision: question.revision } : {}) }) }); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : "Couldn't save this question."); } finally { setBusy(false); }
  }
  return <form className="panel question-editor" onSubmit={save}><h3>{question ? "Edit question" : "Add a question"}</h3><div className="profile-form-grid">
    <label className="full-width">Buyer question<textarea required minLength={12} maxLength={600} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></label>
    <label>Buyer type<select required value={draft.personaId} onChange={(e) => setDraft({ ...draft, personaId: e.target.value })}>{data.personas.map((persona) => <option key={persona.id} value={persona.id}>{persona.role}</option>)}</select></label>
    <label>Journey stage<select value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value as JourneyStage })}>{stages.map((stage) => <option value={stage} key={stage}>{stageLabels[stage]}</option>)}</select></label>
    <label>Question type<select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as QuestionType })}>{questionTypes.map((type) => <option value={type} key={type}>{pretty(type)}</option>)}</select></label>
    <label>Geography<input required maxLength={160} value={draft.geography} onChange={(e) => setDraft({ ...draft, geography: e.target.value })} /></label>
    <label>Buying intent (1 informational – 5 purchase)<input required type="number" min={1} max={5} value={draft.intent} onChange={(e) => setDraft({ ...draft, intent: Number(e.target.value) })} /></label>
    <label className="full-width">What an accurate answer needs (one per line, up to 5)<textarea required maxLength={1204} value={draft.targetFactNeeds.join("\n")} onChange={(e) => setDraft({ ...draft, targetFactNeeds: e.target.value.split("\n") })} /></label>
  </div><p className="helper-note">Include the region in the question itself when it affects pricing, availability or compliance. Ask about unknown capabilities rather than assuming they exist.</p>
    <fieldset className="question-fieldset"><legend>Potentially relevant brands</legend>{data.brands.map((brand) => <label className="profile-checkbox" key={brand.id}><input type="checkbox" checked={draft.expectedBrandIds.includes(brand.id)} onChange={(e) => setDraft({ ...draft, expectedBrandIds: e.target.checked ? [...draft.expectedBrandIds, brand.id] : draft.expectedBrandIds.filter((id) => id !== brand.id) })} />{brand.name}{brand.active ? "" : " (archived website)"}</label>)}</fieldset>
    <details className="question-support"><summary>Link supporting company details (optional)</summary><p className="helper-note">Missing information can stay in the answer-needs list. These source claims provide context, not independently verified facts.</p>{data.facts.map((fact) => <label className="profile-checkbox" key={fact.id}><input type="checkbox" disabled={!draft.targetFactIds.includes(fact.id) && draft.targetFactIds.length >= 8} checked={draft.targetFactIds.includes(fact.id)} onChange={(e) => setDraft({ ...draft, targetFactIds: e.target.checked ? [...draft.targetFactIds, fact.id] : draft.targetFactIds.filter((id) => id !== fact.id) })} /><span>{fact.subject}: {fact.value}</span></label>)}</details>
    {error && <p role="alert" className="notice">{error}</p>}<div className="actions"><button className="button primary small" disabled={busy}>{busy ? "Saving…" : "Save question"}</button><button className="button ghost small" type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>;
}
