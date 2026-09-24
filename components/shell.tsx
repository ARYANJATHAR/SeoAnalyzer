"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Aperture, ArrowUpRight, BarChart3, ChevronDown, FileText, Globe2, LayoutDashboard, ListFilter, Menu, MessagesSquare, Settings2, Sparkles, Users2, X } from "lucide-react";

const mainNavigation = [
  { label: "Home", path: "", icon: LayoutDashboard },
  { label: "AI results", path: "visibility", icon: BarChart3 },
  { label: "Action plan", path: "recommendations", icon: Sparkles },
  { label: "Report", path: "reports", icon: FileText },
];
const detailNavigation = [
  { label: "Website checks", path: "website", icon: Globe2 },
  { label: "Content ideas", path: "content", icon: FileText },
  { label: "Your company", path: "profile", icon: FileText },
  { label: "Buyer questions", path: "questions", icon: MessagesSquare },
  { label: "Competitors", path: "competitors", icon: Users2 },
  { label: "Sources in answers", path: "citations", icon: ListFilter },
];
export function Shell({ children, projectId, projectName, action }: {
  children: React.ReactNode; projectId?: string; projectName?: string; action?: React.ReactNode;
}) {
  const pathname = usePathname(), [open, setOpen] = useState(false);
  const base = projectId ? "/projects/" + projectId : "/projects";
  const isCurrent = (path: string) => pathname === base + (path ? "/" + path : "") || path === "website" && pathname === base + "/evidence";
  const detailActive = detailNavigation.some((item) => isCurrent(item.path));
  const pageName = [...mainNavigation, ...detailNavigation, { label: "Settings", path: "settings" }].find((item) => isCurrent(item.path))?.label;
  function navItem(item: typeof mainNavigation[number]) {
    const Icon = item.icon;
    return <Link key={item.path} href={base + (item.path ? "/" + item.path : "")} aria-current={isCurrent(item.path) ? "page" : undefined} className={`nav-item ${isCurrent(item.path) ? "active" : ""}`} onClick={() => setOpen(false)}><Icon size={18} strokeWidth={1.5} />{item.label}</Link>;
  }
  return <div className="app-shell">
    <aside id="workspace-navigation" className={`sidebar ${open ? "is-open" : ""}`} aria-label="Main navigation">
      <div className="brand-row"><Link href="/" className="wordmark"><Aperture size={28} strokeWidth={1.5} />AnswerLens<span className="wordmark-period">.</span></Link><button aria-label="Close navigation" className="icon-button mobile-only" onClick={() => setOpen(false)}><X size={20} /></button></div>
      <Link className="project-switch" href="/projects"><span className="project-avatar">{projectName?.slice(0, 1).toUpperCase() || "A"}</span><span>{projectName || "Your projects"}<small>{projectId ? "Switch project" : "Choose a website"}</small></span><ChevronDown size={15} /></Link>
      <nav aria-label="Your results">{projectId ? mainNavigation.map(navItem) : <Link className="nav-item active" href="/projects" aria-current="page"><LayoutDashboard size={18} />Your projects</Link>}</nav>
      {projectId && <details key={detailActive ? pathname : "details"} open={detailActive || undefined} className="nav-explore"><summary>Explore details<ChevronDown size={14} /></summary><nav aria-label="Research details">{detailNavigation.map(navItem)}</nav></details>}
      <div className="sidebar-bottom">
        {projectId && <Link href={base + "/settings"} className={`nav-item ${isCurrent("settings") ? "active" : ""}`} aria-current={isCurrent("settings") ? "page" : undefined}><Settings2 size={18} strokeWidth={1.5} />Settings</Link>}
        <div className="local-note"><span className="status-dot" /><span>Saved on this computer<small>Keep the app running during analysis</small></span></div>
      </div>
    </aside>
    {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <div className="workspace-frame"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-only" aria-label="Open navigation" aria-expanded={open} aria-controls="workspace-navigation" onClick={() => setOpen(true)}><Menu size={20} /></button><Link href="/projects">Projects</Link><span>/</span>{projectId ? <><Link href={base}>{projectName || "Your website"}</Link>{pageName && <><span>/</span><span>{pageName}</span></>}</> : <span>Your workspace</span>}</div><div className="topbar-actions">{action || <Link href="/onboarding" className="button secondary small">Add website<ArrowUpRight size={15} /></Link>}</div></header>
      {projectId === "00000000-0000-4000-8000-000000000009" && <aside className="demo-banner"><strong>Sample project.</strong> These results are fictional examples. <Link href="/onboarding">Try your own website ↗</Link></aside>}{children}
    </div>
  </div>;
}
