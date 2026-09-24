"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FileText, Plus, RefreshCw, Users2, X } from "lucide-react";
import type { BuyerPersona, BuyerQuestion } from "@/db/schema";
import type { QuestionEvidence, QuestionSnapshot } from "@/lib/questions/service";
import { stages, stageLabels, pretty } from "@/lib/questions/types";
import { api, dateLabel } from "@/lib/client";
import { Shell } from "./shell";
import { PageEvidence } from "./page-evidence";
import { PersonaForm, QuestionForm } from "./questions-forms";

function QuestionCard({ question, data, disabled, onSelect, onEdit, onArchive, onSource }: { question: BuyerQuestion; data: QuestionSnapshot; disabled: boolean; onSelect: () => void; onEdit: () => void; onArchive: () => void; onSource: (id: string) => void }) {
  const [evidence, setEvidence] = useState<QuestionEvidence | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const persona = data.personas.find((p) => p.id === question.personaId);
  async function loadEvidence() {
    setLoading(true); setError("");
    try { setEvidence(await api<QuestionEvidence>(`/api/projects/${data.project.id}/questions/${question.id}/evidence`)); }
    catch { setError("Couldn't load supporting sources. Try again."); } finally { setLoading(false); }
  }
  return <article className={`panel buyer-question ${question.selected ? "is-selected" : ""}`}>
    <div className="question-heading"><label className="question-pick"><input type="checkbox" aria-label={`Select question: ${question.text}`} checked={question.selected} disabled={disabled || question.status === "archived" || (!question.selected && data.questions.filter((q) => q.selected).length >= 20)} onChange={onSelect} /><span className="sr-only">Select for a future run</span></label><div><div className="fact-top"><span className="badge">{stageLabels[question.stage]}</span><span>{pretty(question.type)}</span>{data.recommendedIds.includes(question.id) && <span className="badge">Suggested pick</span>}{question.status === "archived" && <span className="badge">Archived</span>}</div><h3>{question.text}</h3><p className="helper-note">{persona?.role || "Saved buyer type"} · {question.geography} · Buying intent {question.intent}/5 · {question.branded ? "Names a brand" : "No named brand"} · {question.origin === "generated" ? "Generated suggestion" : "Custom question"}</p></div></div>
    <details className="question-support"><summary>Answer needs & sources</summary><h4>What an accurate answer needs</h4><ul>{question.targetFactNeeds.map((need, index) => <li key={index}>{need}</li>)}</ul><p className="helper-note">Potentially relevant brands: {question.expectedBrandIds.map((id) => data.brands.find((b) => b.id === id)?.name || "Previously saved brand").join(", ") || "Not specified"}. These are research candidates, not measured recommendations.</p>
      {question.targetFactIds.length ? <button className="button ghost small" disabled={loading} onClick={loadEvidence}>{loading ? "Loading…" : "Show supporting sources"}<FileText size={13} /></button> : <p className="helper-note">No existing company detail is linked. The information above still needs to be established.</p>}
      {error && <p className="notice" role="alert">{error}</p>}{evidence?.facts.map((fact) => <div className="fact-source" key={fact.id}><strong>{fact.subject}</strong><p>{fact.value}</p><small>{fact.fromGenerationSnapshot ? "Context saved when this question was generated" : "Linked company detail"}</small>{fact.sources.map((source, index) => <div key={index}><blockquote>{source.quote}</blockquote><a href={source.url} target="_blank" rel="noreferrer">{source.url} ↗</a><p className="helper-note">Collected {dateLabel(source.fetchedAt)}</p><button className="button ghost small" onClick={() => onSource(source.pageId)}>View saved page</button></div>)}</div>)}
    </details><div className="actions"><button className="button ghost small" disabled={disabled} onClick={onEdit}>Edit question</button><button className="button ghost small" disabled={disabled} onClick={onArchive}>{question.status === "active" ? "Archive" : "Restore"}</button></div>
  </article>;
}

function RunPlanner({ projectId, count }: { projectId: string; count: number }) {
  return <section className="panel question-planner"><h2>See how AI answers these questions</h2><p>{count} questions selected. The automatic analysis uses this starting set. You can view saved answers, run another check and change sampling options in Visibility.</p><Link className="button secondary" href={`/projects/${projectId}/visibility`}>Open answer results<ArrowRight size={14} /></Link></section>;
}

export function QuestionsWorkspace({ projectId }: { projectId: string }) {
  const [data, setData] = useState<QuestionSnapshot | null>(null), [refreshId, setRefreshId] = useState(0), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(""), [stage, setStage] = useState(""), [personaId, setPersonaId] = useState(""), [status, setStatus] = useState("active"), [onlySelected, setOnlySelected] = useState(false), [page, setPage] = useState(1);
  const [personaEdit, setPersonaEdit] = useState<BuyerPersona | "new" | null>(null), [questionEdit, setQuestionEdit] = useState<BuyerQuestion | "new" | null>(null), [sourceId, setSourceId] = useState<string | null>(null);
  const refresh = () => setRefreshId((value) => value + 1);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function poll() { try {
      const snapshot = await api<QuestionSnapshot>(`/api/projects/${projectId}/questions`, { signal: controller.signal });
      if (controller.signal.aborted) return; setData(snapshot);
      if (snapshot.analysisActive || snapshot.jobs.some((job) => ["queued", "running"].includes(job.status))) timer = setTimeout(poll, 2500);
    } catch { if (!controller.signal.aborted) { setError("Couldn't load buyer research. Please try again."); timer = setTimeout(poll, 5000); } } }
    void poll(); return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, refreshId]);
  async function mutate(url: string, body: unknown, method = "POST") {
    setBusy(true); setError(""); setNotice("");
    try { await api(url, { method, body: JSON.stringify(body) }); const snapshot = await api<QuestionSnapshot>(`/api/projects/${projectId}/questions`); setData(snapshot); refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Couldn't save this change."); refresh(); } finally { setBusy(false); }
  }
  async function generate() {
    setBusy(true); setError("");
    try { const result = await api<{ reused: boolean }>(`/api/projects/${projectId}/question-generation`, { method: "POST", body: "{}" }); setNotice(result.reused ? "Your question baseline is already ready. Edit questions or change the selection below." : "Buyer research queued. Suggestions appear automatically as they are ready."); const snapshot = await api<QuestionSnapshot>(`/api/projects/${projectId}/questions`); setData(snapshot); refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Couldn't start buyer research."); } finally { setBusy(false); }
  }
  if (!data) return <Shell projectId={projectId}><main className="main" id="main"><h1>Buyer questions</h1>{error ? <p className="notice" role="alert">{error}<button className="button ghost small" onClick={refresh}>Retry</button></p> : <p>Loading your buyer research…</p>}</main></Shell>;
  const activeJob = data.jobs.find((job) => ["queued", "running"].includes(job.status));
  const disabled = busy || data.analysisActive || !!activeJob || !!personaEdit || !!questionEdit;
  const activeQuestions = data.questions.filter((q) => q.status === "active"), selectedIds = activeQuestions.filter((q) => q.selected).map((q) => q.id);
  const filtered = data.questions.filter((q) => q.status === status && (!stage || q.stage === stage) && (!personaId || q.personaId === personaId) && (!onlySelected || q.selected) && q.text.toLowerCase().includes(query.toLowerCase()));
  const maxPage = Math.max(1, Math.ceil(filtered.length / 10)), currentPage = Math.min(page, maxPage);
  const saveSelection = (ids: string[]) => mutate(`/api/projects/${projectId}/question-selection`, { ids, version: data.selectionVersion });
  const formSaved = () => { setPersonaEdit(null); setQuestionEdit(null); refresh(); };
  function archive(question: BuyerQuestion) {
    void mutate(`/api/projects/${projectId}/questions/${question.id}`, { text: question.text, personaId: question.personaId, stage: question.stage, type: question.type, geography: question.geography, intent: question.intent, expectedBrandIds: question.expectedBrandIds, targetFactIds: question.targetFactIds, targetFactNeeds: question.targetFactNeeds, revision: question.revision, status: question.status === "active" ? "archived" : "active" }, "PATCH");
  }
  return <Shell projectId={projectId} projectName={data.project.name}><main className="main questions-workspace" id="main">
    <div className="page-heading compact"><p className="eyebrow">Buyer questions</p><h1>What might your<br />customers ask?</h1><p>AI suggests likely buyers, writes useful questions and picks a starting set for you. Customizing is optional.</p></div>
    {error && <p className="notice" role="alert">{error}<button className="button ghost small" onClick={() => { setError(""); refresh(); }}>Refresh</button></p>}{notice && <p className="notice" role="status">{notice}</p>}
    <section className="research-section"><h2>{selectedIds.length ? "Your suggested starting questions" : "Your starting questions"}</h2>{selectedIds.length ? <ol className="research-question-list">{activeQuestions.filter((q) => q.selected).slice(0, 5).map((q) => <li key={q.id}>{q.text}</li>)}</ol> : <p>{data.analysisActive || activeJob ? "Questions will appear here after AI understands your business." : "Start the automatic analysis to build your company profile and prepare questions together. Saved questions and selection options remain available below."}</p>}{data.personas.length > 0 && <p><strong>Likely buyers:</strong> {data.personas.map((p) => p.role).join(", ")}.</p>}<p className="helper-note">{selectedIds.length ? `${selectedIds.length} questions selected for a visibility check. ` : ""}These are suggestions, not real search data. Open Visibility to see saved answers and progress.</p><Link className="text-link" href={`/projects/${projectId}`}>{data.analysisActive ? "See analysis progress" : "Open automatic analysis"} ↗</Link></section>
    <details className="simple-details panel"><summary>Customize questions & view details</summary>
    <section className="question-generation"><h2>{data.ready ? "Your question set is ready" : "Prepare more buyer research"}</h2><p>AI uses your project context and company details to suggest buyer types and questions. You can also change the suggestions below.</p><div className="actions"><button className="button primary small" disabled={disabled || !data.facts.length || data.ready} onClick={generate}>{activeJob ? "Preparing questions…" : "Prepare buyer questions"}<ArrowRight size={15} /></button><button className="button ghost small" onClick={refresh} disabled={busy}><RefreshCw size={14} />Refresh</button></div></section>
    {data.jobs.length > 0 && <details className="panel profile-job-history" open={!!activeJob}><summary>Generation activity</summary>{data.jobs.map((job) => <div className="profile-job" key={job.id}><div><strong>{job.status === "running" ? "Generating suggestions" : job.status === "queued" ? "Waiting to start" : pretty(job.status)}</strong><p>{dateLabel(job.createdAt)} · {job.questionsCreated} new questions saved</p>{job.message && <p role="status">{job.message}</p>}</div>{["queued", "running"].includes(job.status) && <button className="button ghost small" disabled={busy || job.cancelRequested} onClick={() => mutate(`/api/projects/${projectId}/question-generation/${job.id}/cancel`, {})}><X size={13} />{job.cancelRequested ? "Stopping…" : "Stop"}</button>}</div>)}</details>}
    <div className="metrics-strip"><div><span>Buyer types</span><strong>{data.personas.length}</strong><small>Suggested or customized roles</small></div><div><span>Active questions</span><strong>{activeQuestions.length}</strong><small>Baseline target: 30 distinct questions</small></div><div><span>Selected questions</span><strong>{selectedIds.length}/20</strong><small>Saved for a visibility check</small></div><div><span>Journey stages</span><strong>{new Set(activeQuestions.map((q) => q.stage)).size}/6</strong><small>Coverage across the buying journey</small></div></div>
    <section><div className="section-heading"><div><h2>Who might be buying?</h2><p className="helper-note">These roles describe plausible buyers, not identified people or verified customer segments.</p></div><button className="button secondary small" disabled={disabled || data.personas.length >= 4} onClick={() => setPersonaEdit("new")}><Plus size={14} />Add buyer type</button></div>
      {personaEdit && <PersonaForm key={personaEdit === "new" ? "new" : personaEdit.id} projectId={projectId} persona={personaEdit === "new" ? undefined : personaEdit} onSaved={formSaved} onCancel={() => setPersonaEdit(null)} />}
      <div className="buyer-personas">{data.personas.map((persona) => <article className="panel buyer-persona" key={persona.id}><div className="fact-top"><Users2 size={16} /><span>{persona.origin === "generated" ? "Suggested buyer type" : "Customized buyer type"}</span></div><h3>{persona.role}</h3><p className="helper-note">{persona.companyType}</p><p>{persona.primaryPain}</p><details><summary>Buying context</summary><h4>Purchase criteria</h4><ul>{persona.purchaseCriteria.map((item, i) => <li key={i}>{item}</li>)}</ul><h4>Likely objections</h4><ul>{persona.objections.map((item, i) => <li key={i}>{item}</li>)}</ul><p>Technical familiarity: {persona.sophistication}. Commercial importance: {persona.importance}/5.</p><p className="helper-note">{persona.rationale}</p></details><button className="button ghost small" disabled={disabled} onClick={() => setPersonaEdit(persona)}>Edit buyer type</button></article>)}</div>
    </section>
    <section><div className="section-heading"><h2>What would they ask?</h2><button className="button secondary small" disabled={disabled || !data.personas.length || data.questions.length >= 300} onClick={() => setQuestionEdit("new")}><Plus size={14} />Add question</button></div>
      {questionEdit && <QuestionForm key={questionEdit === "new" ? "new" : questionEdit.id} projectId={projectId} question={questionEdit === "new" ? undefined : questionEdit} data={data} onSaved={formSaved} onCancel={() => setQuestionEdit(null)} />}
      <div className="question-selection"><p><strong>{selectedIds.length} of 20 selected</strong><span className="helper-note"> Suggested picks favor buying intent while covering different stages and buyer types.</span></p><div className="actions"><button className="button secondary small" disabled={disabled || !activeQuestions.length} onClick={() => saveSelection(data.recommendedIds)}>Select suggested {data.recommendedIds.length}</button><button className="button ghost small" disabled={disabled || !selectedIds.length} onClick={() => saveSelection([])}>Clear selection</button></div></div>
      <div className="table-toolbar question-filters"><input aria-label="Search questions" placeholder="Search buyer questions…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /><select aria-label="Journey stage" value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }}><option value="">All stages</option>{stages.map((value) => <option key={value} value={value}>{stageLabels[value]}</option>)}</select><select aria-label="Buyer type" value={personaId} onChange={(e) => { setPersonaId(e.target.value); setPage(1); }}><option value="">All buyer types</option>{data.personas.map((p) => <option key={p.id} value={p.id}>{p.role}</option>)}</select><select aria-label="Question status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="active">Active</option><option value="archived">Archived</option></select></div><label className="profile-checkbox"><input type="checkbox" checked={onlySelected} onChange={(e) => { setOnlySelected(e.target.checked); setPage(1); }} />Show selected questions only</label>
      {filtered.slice((currentPage - 1) * 10, currentPage * 10).map((question) => <QuestionCard key={`${question.id}-${question.revision}`} question={question} data={data} disabled={disabled} onEdit={() => setQuestionEdit(question)} onSelect={() => saveSelection(question.selected ? selectedIds.filter((id) => id !== question.id) : [...selectedIds, question.id])} onArchive={() => archive(question)} onSource={setSourceId} />)}
      {!filtered.length && <p className="panel">No questions match this view. Generate suggestions, add a custom question, or change your filters.</p>}
      <div className="table-footer"><span>{filtered.length} matching questions · Page {currentPage}/{maxPage}</span><div className="actions"><button className="button ghost small" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="button ghost small" disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
    </section>
    <RunPlanner projectId={projectId} count={selectedIds.length} />
    </details>
  </main><PageEvidence key={sourceId || "closed"} pageId={sourceId} onClose={() => setSourceId(null)} /></Shell>;
}
