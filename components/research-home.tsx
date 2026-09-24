"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Globe2, Sparkles } from "lucide-react";
import type { ResearchSummary } from "@/lib/research/service";
import { api, dateLabel } from "@/lib/client";
import { Shell } from "./shell";
import { analysisStep } from "@/lib/presentation";

export function ResearchHome({ projectId, websiteOnly = false }: { projectId: string; websiteOnly?: boolean }) {
  const [data, setData] = useState<ResearchSummary | null>(null), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api<ResearchSummary>(`/api/projects/${projectId}/research`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setData(next);
        if (next.flow?.status === "running" || next.outcomes.active || ["queued", "running"].includes(next.collection?.status || "")) timer = setTimeout(poll, 2500);
      } catch { if (!controller.signal.aborted) { setError("We could not load your summary. Try refreshing."); timer = setTimeout(poll, 5000); } }
    }
    void poll(); return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, revision]);
  async function action(stop = false, refresh = false) {
    setBusy(true); setError("");
    try { await api(`/api/projects/${projectId}/research${stop ? "/stop" : ""}`, { method: "POST", body: JSON.stringify(stop ? {} : { refresh }) }); setRevision((v) => v + 1); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update your analysis."); } finally { setBusy(false); }
  }
  const base = "/projects/" + projectId;
  if (!data) return <Shell projectId={projectId}><main id="main" className="main calm-home"><h1>Your website, at a glance.</h1><p role={error ? "alert" : "status"}>{error || "Loading your saved results…"}</p>{error && <button className="button secondary" onClick={() => { setError(""); setRevision((v) => v + 1); }}>Try again</button>}</main></Shell>;
  const running = data.flow?.status === "running", complete = data.flow?.status === "completed", partial = data.flow?.status === "partial" || data.flow?.status === "cancelled";
  const demo = projectId === "00000000-0000-4000-8000-000000000009", step = analysisStep(data.flow?.stage);
  const hasResults = data.outcomes.answers > 0 || data.outcomes.actions > 0 || !!data.audit;
  return <Shell projectId={projectId} projectName={data.project.name}><main id="main" className="main calm-home">
    <header className="calm-heading"><p className="eyebrow">{websiteOnly ? "Website checks" : "Your website at a glance"}</p><h1>{running ? "Your analysis is underway." : hasResults || demo ? "Here is your starting point." : "Let’s get to know your website."}</h1><p>{websiteOnly ? "The main issues found in the pages we could read." : running ? "You can leave this page. Results are saved as each step finishes." : hasResults || demo ? "See what we found, then choose what to improve." : "Add a website. We will read it, check AI answers and suggest what to improve."}</p><a className="calm-domain" href={data.project.website} target="_blank" rel="noreferrer"><Globe2 size={14} />{new URL(data.project.website).hostname} ↗</a></header>
    {error && <p className="notice" role="alert">{error}<button className="button ghost small" onClick={() => { setError(""); setRevision((v) => v + 1); }}>Refresh</button></p>}
    {running ? <section className="panel calm-progress" aria-label="Analysis progress">
      <div className="section-heading"><div><p className="eyebrow">Step {step.index + 1} of 3</p><h2>{step.title}</h2></div><span className="badge">In progress</span></div><p role="status">{step.detail}</p>
      <ol className="calm-step-track">{["Read website", "Check AI answers", "Prepare your plan"].map((label, i) => <li key={label} aria-current={i === step.index ? "step" : undefined}><span>{i < step.index ? <Check size={14} /> : i + 1}</span>{label}</li>)}</ol>
      <details className="simple-details"><summary>Analysis controls</summary><p>The local app needs to stay running. Stopping keeps everything already saved.</p><button className="button secondary small" disabled={busy} onClick={() => action(true)}>Stop analysis</button></details>
    </section> : !demo && (!hasResults || partial || !complete && !data.outcomes.answers && !data.outcomes.actions) ? <section className="panel calm-start"><Sparkles size={24} strokeWidth={1.5} /><div><h2>{partial ? "Some work is unfinished." : "One click starts the research."}</h2><p>{partial ? "Your saved results are below. Continue to try the unfinished work again." : "We will use your website to prepare questions, check AI answers and suggest improvements."}</p><button className="button primary" disabled={busy} onClick={() => action(false, !!data.collection && !data.collection.pages)}>{busy ? "Starting…" : partial ? "Continue analysis" : "Analyze website"}<ArrowRight size={15} /></button></div></section> : null}
    {!websiteOnly && <div className="calm-result-grid">
      <section className="panel calm-result"><p className="eyebrow">01 · AI results</p><h2>{data.outcomes.answers ? `Your brand appeared in ${data.outcomes.mentions} of ${data.outcomes.answers} answers.` : "Do AI answers mention you?"}</h2><p>{data.outcomes.answers ? "These are saved answers to buyer questions. Open the results to see what was said." : running ? "We will check this after understanding your website." : "Run an analysis to find out what the sampled AI answers say."}</p><Link className="text-link" href={base + "/visibility"}>{data.outcomes.answers ? "See your AI results" : "Open AI results"}<ArrowRight size={16} /></Link><small>Based only on the saved answer sample.</small></section>
      <section className="panel calm-result calm-result-tinted"><p className="eyebrow">02 · Your next steps</p><h2>{data.outcomes.actions ? `${data.outcomes.actions} suggested improvements.` : "Know what to work on next."}</h2><p>{data.outcomes.firstAction || "Your plan will prioritize useful changes, explain why they matter and show the supporting evidence."}</p><Link className="text-link" href={base + "/recommendations"}>{data.outcomes.actions ? "Open your action plan" : "Open action plan"}<ArrowRight size={16} /></Link><small>Suggestions to review, with no ranking guarantees.</small></section>
    </div>}
    <section className="calm-website"><div className="section-heading"><h2>Website essentials</h2>{data.collection && <small>{data.collection.pages} pages read · {dateLabel(data.collection.date)}</small>}</div>
      {!data.audit ? <p>{demo ? "This demo uses sample pages. Open Explore details to inspect them." : running ? "Website findings will appear after collection finishes." : "No website checks yet. Start an analysis to collect your pages."}</p> : data.audit.groups.length ? <div className="calm-findings">{data.audit.groups.map((g) => <Link key={g.category} href={base + "/evidence"} className="calm-finding"><span><h3>{g.title}</h3><p>{g.explanation}</p></span><ArrowRight size={16} /></Link>)}</div> : <p>No errors or warnings were found in the available checks.</p>}
      {data.audit && <details className="simple-details"><summary>See check coverage & all findings</summary><p>{data.collection?.partial || data.audit.limited ? "Some pages or checks are incomplete." : "Findings cover the pages collected, not every page on the website."} {data.audit.observations} additional observations are available. Website checks do not measure AI visibility.</p><Link href={base + "/evidence"} className="text-link">Open detailed website checks ↗</Link></details>}
    </section>
    {!websiteOnly && <details className="simple-details panel calm-context"><summary>What we learned about your company</summary><p>{data.company.description || "A description will appear when the company profile is ready."}</p>{data.company.customers.length > 0 && <p><strong>Likely customers:</strong> {data.company.customers.join(" ")}</p>}{data.company.conflicts > 0 && <p>Some source details differ. Check their dates and context in your company profile.</p>}<p className="helper-note">Based on website claims, which may need correction.</p><div className="result-links"><Link href={base + "/profile"} className="text-link">Company details ↗</Link><Link href={base + "/questions"} className="text-link">Buyer questions ↗</Link></div></details>}
    {!running && !demo && (hasResults || complete) && <details className="simple-details"><summary>Refresh your research</summary><p>Changed your website? Read it again and collect a new set of AI answers. Your previous results stay saved.</p><button className="button secondary small" disabled={busy} onClick={() => action(false, true)}>{busy ? "Starting…" : "Run a fresh analysis"}</button></details>}
  </main></Shell>;
}
