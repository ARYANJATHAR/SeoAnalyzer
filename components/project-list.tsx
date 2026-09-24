"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Globe2, Plus, ScanLine } from "lucide-react";
import { Shell } from "./shell";
import { api, dateLabel } from "@/lib/client";
import type { listProjects } from "@/db/repositories/projects";

type Projects = ReturnType<typeof listProjects>;
import { DemoButton } from "./demo-button"; export function ProjectList() {
  const [projects, setProjects] = useState<Projects | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<Projects>("/api/projects", { signal: controller.signal }).then(setProjects).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [retry]);
  return <Shell><main id="main" className="main">
    <div className="page-heading"><p className="eyebrow">Your projects</p><h1>A clearer view<br />of your website.</h1><p>See what AI says about your business<br className="desktop-only" /> and choose what to improve next.</p></div>
    <div className="section-heading"><h2>Your websites <span className="count">{projects?.length ?? "—"}</span></h2><Link href="/onboarding" className="button primary"><Plus size={16} />Add website</Link></div>
    {error ? <div role="alert" className="notice"><p>{error}</p><button className="button secondary" onClick={() => { setError(""); setRetry((value) => value + 1); }}>Try again</button></div> : !projects ? <div className="panel loading-state" aria-busy="true">Loading your projects…</div> : projects.length ? <div className="project-grid">{projects.map((project) => <Link key={project.id} className="project-card" href={`/projects/${project.id}`}>
      <div className="project-card-top"><span className="large-avatar">{project.companyName.slice(0, 1)}</span><ArrowUpRight size={20} /></div><h3>{project.name}</h3><p className="mono wrap">{new URL(project.primaryDomain).hostname}</p><div className="project-card-bottom"><span>{project.brands.filter((brand) => brand.kind === "competitor").length} competitors</span><span>{project.lastRun ? dateLabel(project.lastRun.createdAt) : "Ready to analyze"}</span></div>
    </Link>)}</div> : <div className="welcome-panel"><div><span className="large-avatar"><Globe2 size={28} strokeWidth={1.25} /></span><h2>Start with your website.</h2><p>Enter your website. We will read your pages, check AI answers and suggest useful improvements.</p><Link href="/onboarding" className="text-link">Analyze your website<ArrowRight size={18} /></Link></div><div className="workflow-preview"><p className="eyebrow">A useful starting point</p>{[["01", "Add your website", "One address is enough to start."], ["02", "Let the analysis run", "We read your pages and check AI answers."], ["03", "Read your results", "AI answers, useful changes and a clear plan."]].map(([number, title, detail]) => <div className="workflow-step" key={number}><span>{number}</span><div><h3>{title}</h3><p>{detail}</p></div></div>)}</div></div>}
    <div className="result-links"><DemoButton /></div><div className="footnote"><ScanLine size={18} strokeWidth={1.5} /><p>Start with a website. Explore saved AI answers, content gaps and an evidence-based plan. Results always disclose the sample they cover.</p></div>
  </main></Shell>;
}
