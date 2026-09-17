"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Globe2, Plus, ScanLine } from "lucide-react";
import { Shell } from "./shell";
import { api, dateLabel } from "@/lib/client";
import type { listProjects } from "@/db/repositories/projects";

type Projects = ReturnType<typeof listProjects>;
export function ProjectList() {
  const [projects, setProjects] = useState<Projects | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<Projects>("/api/projects", { signal: controller.signal }).then(setProjects).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [retry]);
  return <Shell><main id="main" className="main">
    <div className="page-heading"><p className="eyebrow">Your projects</p><h1>A clearer view<br />of your website.</h1><p>Collect the pages and facts behind your brand.<br className="desktop-only" /> Build the foundation for better AI discoverability.</p></div>
    <div className="section-heading"><h2>Research projects <span className="count">{projects?.length ?? "—"}</span></h2><Link href="/onboarding" className="button primary"><Plus size={16} />Create project</Link></div>
    {error ? <div role="alert" className="notice"><p>{error}</p><button className="button secondary" onClick={() => { setError(""); setRetry((value) => value + 1); }}>Try again</button></div> : !projects ? <div className="panel loading-state" aria-busy="true">Loading your projects…</div> : projects.length ? <div className="project-grid">{projects.map((project) => <Link key={project.id} className="project-card" href={`/projects/${project.id}`}>
      <div className="project-card-top"><span className="large-avatar">{project.companyName.slice(0, 1)}</span><ArrowUpRight size={20} /></div><h3>{project.name}</h3><p className="mono wrap">{new URL(project.primaryDomain).hostname}</p><div className="project-card-bottom"><span>{project.brands.filter((brand) => brand.kind === "competitor").length} competitors</span><span>{project.lastRun ? dateLabel(project.lastRun.createdAt) : "Ready for first crawl"}</span></div>
    </Link>)}</div> : <div className="welcome-panel"><div><span className="large-avatar"><Globe2 size={28} strokeWidth={1.25} /></span><h2>Start with your website.</h2><p>Add your company and competitors. We’ll discover public pages and organize their content into an inspectable website inventory.</p><Link href="/onboarding" className="text-link">Set up your first project<ArrowRight size={18} /></Link></div><div className="workflow-preview"><p className="eyebrow">A useful starting point</p>{[["01", "Define your company", "Your website, audience, and market."], ["02", "Discover public pages", "Review access and choose your crawl limit."], ["03", "Explore the evidence", "Headings, content, links, and structured data."]].map(([number, title, detail]) => <div className="workflow-step" key={number}><span>{number}</span><div><h3>{title}</h3><p>{detail}</p></div></div>)}</div></div>}
    <div className="footnote"><ScanLine size={18} strokeWidth={1.5} /><p>Collect website evidence and review technical audit findings. AI experiments, visibility metrics, and broader recommendations follow in later phases.</p></div>
  </main></Shell>;
}
