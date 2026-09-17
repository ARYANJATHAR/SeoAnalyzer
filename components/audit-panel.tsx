"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, CircleAlert, RefreshCw, Search, ShieldCheck } from "lucide-react";
import type { AuditIssue } from "@/db/schema";
import type { ProjectAudits } from "@/lib/audit/service";
import { api, dateLabel } from "@/lib/client";
import { AuditIssueDetail } from "./audit-issue";

function IssueRow({ issue, onOpenPage }: { issue: ProjectAudits["issues"][number]; onOpenPage: (id: string) => void }) {
  const [detail, setDetail] = useState<AuditIssue | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  async function expand() {
    setOpen(!open);
    if (open || detail || busy) return;
    setBusy(true); setError("");
    try { setDetail(await api<AuditIssue>(`/api/issues/${issue.id}`)); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not load issue evidence."); }
    finally { setBusy(false); }
  }
  return <div className="audit-issue-row"><button className="audit-issue-toggle" aria-expanded={open} aria-controls={`issue-${issue.id}`} onClick={expand}>
    <span className={`badge severity-${issue.severity}`}>{issue.severity}</span><span><strong>{issue.title}</strong><small className="mono">{issue.url}</small></span><ArrowRight size={16} />
  </button>{open && <div id={`issue-${issue.id}`} className="audit-expanded">{busy && <p aria-live="polite">Loading evidence…</p>}{error && <p role="alert">{error} Close and reopen to retry.</p>}{detail && <AuditIssueDetail issue={detail} />}{issue.pageId && <button className="button secondary small" onClick={() => onOpenPage(issue.pageId!)}>Open page evidence<ArrowRight size={14} /></button>}</div>}</div>;
}

export function AuditPanel({ projectId, runId, brandId, refreshToken, onOpenPage, scopeControls }: { projectId: string; runId: string; brandId: string; refreshToken: string; onOpenPage: (id: string) => void; scopeControls: ReactNode }) {
  const [data, setData] = useState<ProjectAudits | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [severity, setSeverity] = useState("");
  const [category, setCategory] = useState("");
  const [rule, setRule] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const requestKey = JSON.stringify([projectId, runId, brandId, severity, category, rule, query, page, revision, refreshToken]);
  const [loadedKey, setLoadedKey] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const params = new URLSearchParams({ runId, brandId, severity, category, ruleId: rule, query, page: String(page) });
    async function load() {
      try {
        const next = await api<ProjectAudits>(`/api/projects/${projectId}/audits?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setData(next); setLoadedKey(requestKey); setError("");
        if (next.runs.some((run) => ["queued", "running"].includes(run.crawlStatus) || (!run.audit && !run.error && Date.now() - Date.parse(run.crawlCompletedAt || run.crawlCreatedAt) < 30_000))) timer = setTimeout(load, 2000);
      } catch (error) { if (!controller.signal.aborted) { setData(null); setError(error instanceof Error ? error.message : "Could not load technical audit."); setLoadedKey(requestKey); } }
    }
    timer = setTimeout(load, query ? 250 : 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, runId, brandId, severity, category, rule, query, page, requestKey]);

  async function audit(crawlId: string) {
    setBusy(crawlId); setError("");
    try { await api(`/api/crawls/${crawlId}/audit`, { method: "POST", body: "{}" }); setRevision((value) => value + 1); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not run the audit."); }
    finally { setBusy(null); }
  }
  const loading = loadedKey !== requestKey;
  return <section className="audit-section" aria-labelledby="audit-heading">
    <div className="section-heading"><div><p className="eyebrow">Technical audit</p><h2 id="audit-heading">Findings, with the evidence.</h2><p>{runId ? "Saved evidence from the crawl selected below." : "Latest crawl for each tracked website; previous audits are available through crawl history."}</p></div><button className="button ghost small" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={14} />Refresh audit</button></div>
    {error && <div className="notice" role="alert"><CircleAlert size={16} />{error}</div>}
    {loading && <p className="helper-note" role="status">Loading audit findings…</p>}
    <div className="audit-scope-controls">{scopeControls}</div>
    {data && <>
      <div className="audit-counts" aria-label="Findings in selected crawl and website scope">{(["error", "warning", "observation"] as const).map((value) => <button key={value} className={severity === value ? "selected" : ""} aria-pressed={severity === value} onClick={() => { setSeverity(severity === value ? "" : value); setPage(1); }}><span>{value === "error" ? "Errors" : value === "warning" ? "Warnings" : "Observations"}</span><strong>{data.runs.some((run) => run.audit) ? data.counts[value].toLocaleString() : "—"}</strong><small>{value === "error" ? "Confirmed request, link or syntax failures" : value === "warning" ? "Implementation signals to investigate" : "Context and heuristic reviews"}</small></button>)}</div>
      <p className="helper-note">Counts include {data.runs.filter((run) => run.audit).length} of {data.runs.length} selected crawl snapshots with a saved audit, before issue filters.</p>
      <div className="panel audit-panel">
        <div className="audit-run-summaries">{data.runs.length ? data.runs.map((run) => <div className="audit-run-summary" key={run.crawlId}><div><strong>{run.brandName}</strong><p>{dateLabel(run.crawlCreatedAt)} · {run.crawlStatus} · {run.processed} attempts / {run.pageLimit} cap</p>{run.audit ? <small>{run.audit.pagesAnalyzed} HTML pages analyzed · {run.audit.ruleVersion} · audit {dateLabel(run.audit.createdAt)}</small> : <small>{["queued", "running"].includes(run.crawlStatus) ? "Audit starts automatically when collection stops." : "No audit saved for this crawl and rule version."}</small>}{run.error && <p className="run-error">{run.error}</p>}</div>{!run.audit && !["queued", "running"].includes(run.crawlStatus) && <button className="button secondary small" disabled={!!busy} onClick={() => audit(run.crawlId)}><ShieldCheck size={14} />{busy === run.crawlId ? "Auditing…" : "Audit saved pages"}</button>}</div>) : <p>Start a crawl to collect evidence for your first audit.</p>}</div>
        <div className="table-toolbar"><div className="search-input"><Search size={16} /><input aria-label="Search audit issue title or URL" placeholder="Search findings or URLs…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></div>
          <select aria-label="Filter audit severity" value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); }}><option value="">All severities</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="observation">Observations</option></select>
          <select aria-label="Filter audit category" value={category} onChange={(event) => { setCategory(event.target.value); setRule(""); setPage(1); }}><option value="">All categories</option>{data.categories.map((value) => <option key={value}>{value}</option>)}</select>
          <select aria-label="Filter audit rule" value={rule} onChange={(event) => { setRule(event.target.value); setPage(1); }}><option value="">All rules</option>{data.rules.map((value) => <option value={value.id} key={value.id}>{value.title}</option>)}</select>
        </div>
        {!loading && data.issues.map((issue) => <IssueRow key={issue.id} issue={issue} onOpenPage={onOpenPage} />)}
        {!loading && !data.issues.length && <div className="audit-empty"><ShieldCheck size={26} strokeWidth={1.4} /><h3>{data.runs.some((run) => run.audit) ? "No findings match this view." : "Your audit will appear here."}</h3><p>{data.runs.some((run) => run.audit) ? "Review check coverage below. Missing evidence is never counted as a passed check." : "New crawls are audited automatically. You can also audit saved pages from an earlier crawl."}</p></div>}
        {!loading && data.total > 0 && <div className="table-footer"><span>{(data.page - 1) * 20 + 1}–{Math.min(data.page * 20, data.total)} of {data.total} findings</span><div className="actions"><button className="button ghost small" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>Previous</button><span>{data.page} / {Math.ceil(data.total / 20)}</span><button className="button ghost small" disabled={data.page * 20 >= data.total} onClick={() => setPage(data.page + 1)}>Next</button></div></div>}
      </div>
      {data.runs.filter((run) => run.audit).map((run) => <details className="audit-coverage panel" key={run.crawlId}><summary>Check coverage & limitations · {run.brandName}</summary><ul className="audit-limitations">{run.audit!.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><p className="helper-note">Counts represent page checks; site-level rules are evaluated once. “No finding” applies only to available evidence. Inapplicable and unavailable checks are separate.</p><div className="table-scroll"><table><thead><tr><th>Rule</th><th>Findings</th><th>No finding</th><th>Unavailable</th><th>Inapplicable</th></tr></thead><tbody>{run.audit!.coverage.map((row) => <tr key={row.ruleId}><td><span>{row.title}</span><small className="mono">{row.ruleId}</small></td><td>{row.findings}</td><td>{row.passed}</td><td>{row.unavailable}</td><td>{row.notApplicable}</td></tr>)}</tbody></table></div></details>)}
      <p className="helper-note">Observations are review prompts, not ranking penalties. These checks do not measure AI visibility.</p>
    </>}
  </section>;
}
