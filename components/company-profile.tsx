"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, FileText, RefreshCw, X } from "lucide-react";
import type { CompanyFact } from "@/db/schema";
import type { ExtractionPreview, ProfileSnapshot } from "@/lib/profile/service";
import { categories } from "@/lib/profile/facts";
import { api, dateLabel } from "@/lib/client";
import { Shell } from "./shell";
import { PageEvidence } from "./page-evidence";

function FactCard({ fact, onSource }: { fact: CompanyFact; onSource: (id: string) => void }) {
  return <article className="panel fact-card">
    <div className="fact-top"><span className="badge">From website content</span><span>{fact.category.replaceAll("_", " ")}</span></div>
    <h3>{fact.subject} · {fact.attribute.replaceAll("_", " ")}</h3><p className="fact-value">{fact.value}</p>
    <details className="simple-details"><summary>Where this came from</summary>{fact.sources.map((source, index) => <div className="fact-source" key={index}><blockquote>{source.quote}</blockquote><a href={source.url} target="_blank" rel="noreferrer" className="mono">{source.url} ↗</a><p className="helper-note">Collected {dateLabel(source.fetchedAt)}</p><button className="button ghost small" onClick={() => onSource(source.pageId)}>View saved page<ArrowRight size={12} /></button></div>)}</details>
  </article>;
}

function ExtractionPanel({ projectId, crawlId, active, onQueued }: { projectId: string; crawlId: string; active: boolean; onQueued: () => void }) {
  const [preview, setPreview] = useState<ExtractionPreview | null>(null), [selected, setSelected] = useState<string[]>([]);
  const [force, setForce] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<ExtractionPreview>(`/api/projects/${projectId}/profile/preview?crawlId=${crawlId}`, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) { setPreview(data); setSelected(data.suggestedIds); } }).catch(() => { if (!controller.signal.aborted) setError("Couldn't load saved pages. Refresh and try again."); });
    return () => controller.abort();
  }, [projectId, crawlId]);
  async function start() {
    setBusy(true); setError(""); setNotice("");
    try { const result = await api<{ reused: boolean }>(`/api/projects/${projectId}/profile/extract`, { method: "POST", body: JSON.stringify({ crawlId, pageIds: selected, force }) }); setNotice(result.reused ? "Your saved profile is shown below." : "Creating your profile. Results appear automatically as pages are processed."); onQueued(); }
    catch (error) { setError(error instanceof Error ? error.message : "Couldn't create the profile. Please try again later."); } finally { setBusy(false); }
  }
  return <section className="panel extraction-panel"><div className="section-heading"><div><h2>Turn your website into a company profile</h2><p>Choose saved pages. We will organize what they say about the company, its products and customers.</p></div></div>
    {error && <p className="notice" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    {preview ? <><p className="helper-note">Choose up to {preview.pageLimit} pages. Only the selected public page text is used for this analysis.</p>
      <div className="profile-sources">{preview.sources.map((source) => <label className="profile-source-choice" key={source.id}><input type="checkbox" checked={selected.includes(source.id)} disabled={active || busy || (!selected.includes(source.id) && selected.length >= preview.pageLimit)} onChange={(e) => setSelected(e.target.checked ? [...selected, source.id] : selected.filter((id) => id !== source.id))} /><span><strong>{source.title || "Untitled page"}</strong><small className="mono">{source.url}</small>{source.truncated && <small>Uses the first part of this page</small>}</span></label>)}</div>
      {!preview.sources.length && <p>No readable text is available in this crawl.</p>}
      <label className="profile-checkbox"><input type="checkbox" checked={force} disabled={active || busy} onChange={(e) => setForce(e.target.checked)} />Generate again instead of using saved results</label>
      <button className="button primary" disabled={busy || active || !selected.length} onClick={start}>{active ? "Creating profile…" : busy ? "Starting…" : "Create company profile"}<ArrowRight size={14} /></button>
    </> : !error && <p>Loading saved pages…</p>}
  </section>;
}

const progressLabels = { queued: "Waiting to start", running: "Creating profile", completed: "Complete", partial: "Partly complete", failed: "Couldn't complete", cancelled: "Stopped" };
export function CompanyProfile({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProfileSnapshot | null>(null), [brandId, setBrandId] = useState(""), [crawlId, setCrawlId] = useState(""), [revision, setRevision] = useState(0), [error, setError] = useState("");
  const [category, setCategory] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1), [selectedPage, setSelectedPage] = useState<string | null>(null);
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function poll() { try {
      const profile = await api<ProfileSnapshot>(`/api/projects/${projectId}/profile?brandId=${brandId}`, { signal: controller.signal });
      if (controller.signal.aborted) return; setData(profile); setError("");
      if (profile.analysisActive || profile.jobs.some((job) => ["queued", "running"].includes(job.status))) timer = setTimeout(poll, 2500);
    } catch { if (!controller.signal.aborted) { setError("Couldn't load the profile. Please try again."); timer = setTimeout(poll, 5000); } } }
    void poll(); return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, brandId, revision]);
  async function cancel(id: string) { try { await api(`/api/profile-jobs/${id}/cancel`, { method: "POST", body: "{}" }); refresh(); } catch { setError("Couldn't stop the profile. Please try again."); } }
  if (!data) return <Shell projectId={projectId}><main id="main" className="main"><h1>Company profile</h1>{error ? <p role="alert" className="notice">{error}<button className="button ghost small" onClick={refresh}>Retry</button></p> : <p>Loading your company profile…</p>}</main></Shell>;
  const selectedCrawl = data.runs.find((run) => run.id === crawlId && !["queued", "running"].includes(run.status))?.id || data.runs.find((run) => !["queued", "running"].includes(run.status) && run.pagesFetched > 0)?.id || "";
  const facts = data.facts.filter((fact) => fact.status !== "rejected");
  const filtered = facts.filter((fact) => (!category || fact.category === category) && `${fact.subject} ${fact.attribute} ${fact.value}`.toLowerCase().includes(query.toLowerCase()));
  const maxPage = Math.max(1, Math.ceil(filtered.length / 12)), currentPage = Math.min(page, maxPage);
  const active = data.analysisActive || data.jobs.some((job) => ["queued", "running"].includes(job.status));
  const sourceCount = new Set(facts.flatMap((fact) => fact.sources.map((source) => source.pageId))).size;
  return <Shell projectId={projectId} projectName={data.project.name}><main id="main" className="main company-profile">
    <div className="page-heading compact"><p className="eyebrow">Company profile</p><h1>Your business,<br />in simple words.</h1><p>AI brings together what your website says, so you do not have to fill in a long profile.</p></div>
    {error && <p className="notice" role="alert">{error}<button className="button ghost small" onClick={refresh}>Retry</button></p>}
    <section className="research-section"><h2>What we understand so far</h2><p className="research-description">{facts.find((fact) => ["summary", "description"].includes(fact.category))?.value || (active ? "We're reading your website and preparing this summary." : facts.length ? "Company details are saved below. The available pages did not provide a short description." : "Start the automatic analysis and we'll prepare your company profile for you.")}</p><ul className="research-highlights">{facts.filter((fact) => ["product", "target_customer", "use_case"].includes(fact.category)).slice(0, 3).map((fact) => <li key={fact.id}>{fact.value}</li>)}</ul><p className="helper-note">Based on claims from the website. Sources and additional details are available below.</p><Link className="text-link" href={`/projects/${projectId}`}>{active ? "See analysis progress" : "Open automatic analysis"} ↗</Link></section>
    <details className="simple-details panel"><summary>View all company details & options</summary>
    <div className="profile-scope"><label>Website<select value={data.selectedBrandId} onChange={(e) => { setBrandId(e.target.value); setCrawlId(""); setData(null); setPage(1); setSelectedPage(null); }}>{data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}{site.active ? "" : " (archived)"}</option>)}</select></label><label>Saved crawl<select value={selectedCrawl} onChange={(e) => setCrawlId(e.target.value)}><option value="">Choose a crawl</option>{data.runs.filter((run) => !["queued", "running"].includes(run.status)).map((run) => <option key={run.id} value={run.id}>{dateLabel(run.createdAt)} · {run.pagesFetched} pages</option>)}</select></label><button className="button ghost small" onClick={refresh}><RefreshCw size={14} />Refresh</button></div>
    {selectedCrawl ? <ExtractionPanel key={selectedCrawl} projectId={projectId} crawlId={selectedCrawl} active={active} onQueued={refresh} /> : <div className="panel"><FileText size={24} /><h2>Collect website pages first.</h2><p>Start a crawl in Website, then return here to create the company profile.</p></div>}
    {data.jobs.length > 0 && <details className="panel profile-job-history" open><summary>Profile activity</summary>{data.jobs.map((job) => <div className="profile-job" key={job.id}><div><strong>{progressLabels[job.status]}</strong><p>{dateLabel(job.createdAt)} · {job.processed}/{job.pageCount} pages processed · {job.factsCreated} new details</p>{job.message && <p role="status">{job.message}</p>}</div>{["queued", "running"].includes(job.status) && <button className="button ghost small" disabled={job.cancelRequested} onClick={() => cancel(job.id)}><X size={12} />{job.cancelRequested ? "Stopping…" : "Stop"}</button>}</div>)}</details>}
    <div className="metrics-strip"><div><span>Company details</span><strong>{facts.length}</strong><small>Across saved crawls for this website</small></div><div><span>Source pages</span><strong>{sourceCount}</strong><small>Saved pages supporting these details</small></div><div><span>Topics covered</span><strong>{new Set(facts.map((fact) => fact.category)).size}</strong><small>Based on available website content</small></div><div><span>Different claims</span><strong>{data.conflicts.length}</strong><small>Where saved sources may disagree</small></div></div>
    {data.conflicts.length > 0 && <details className="panel profile-conflicts"><summary><CircleAlert size={16} />Where sources differ ({data.conflicts.length})</summary><p className="helper-note">Different pages may describe different plans, regions or dates. Both claims stay visible with their sources.</p>{data.conflicts.map((conflict, i) => <div className="profile-conflict" key={i}><strong>{conflict.subject} · {conflict.attribute.replaceAll("_", " ")}</strong><ul>{conflict.values.map((value) => <li key={value}>{value}</li>)}</ul><button className="button ghost small" onClick={() => { setCategory(conflict.category); setQuery(conflict.attribute); setPage(1); }}>Show related details</button></div>)}</details>}
    <section><div className="section-heading"><h2>What the website tells us</h2><span className="count">{filtered.length}</span></div><p className="helper-note">These details summarize website claims. Source quotes show where they came from; they do not independently prove the claims.</p>
      <div className="table-toolbar"><input aria-label="Search company details" placeholder="Search products, features or pricing…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /><select aria-label="Topic" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">All topics</option>{categories.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
      {filtered.slice((currentPage - 1) * 12, currentPage * 12).map((fact) => <FactCard key={fact.id} fact={fact} onSource={setSelectedPage} />)}{!filtered.length && <p className="panel">No details to show yet. Create a profile from saved pages or change your filters.</p>}
      {filtered.length > 12 && <div className="table-footer"><span>Page {currentPage} / {maxPage}</span><div className="actions"><button className="button ghost small" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="button ghost small" disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>}
    </section>
    </details>
  </main><PageEvidence key={selectedPage || "closed"} pageId={selectedPage} onClose={() => setSelectedPage(null)} /></Shell>;
}
