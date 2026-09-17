"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Aperture, ArrowUpRight, BarChart3, ChevronDown, FileText, Globe2, LayoutDashboard, ListFilter, Menu, MessagesSquare, Settings2, Sparkles, Users2, X } from "lucide-react";

const navigation = [
  { label: "Overview", path: "", icon: LayoutDashboard, live: true },
  { label: "Visibility", path: "visibility", icon: BarChart3, live: false },
  { label: "Questions", path: "questions", icon: MessagesSquare, live: false },
  { label: "Competitors", path: "settings", icon: Users2, live: true },
  { label: "Citations", path: "citations", icon: ListFilter, live: false },
  { label: "Website", path: "website", icon: Globe2, live: true },
  { label: "Company profile", path: "profile", icon: FileText, live: true },
  { label: "Recommendations", path: "recommendations", icon: Sparkles, live: false },
  { label: "Reports", path: "reports", icon: FileText, live: false },
];
export function Shell({ children, projectId, projectName, action }: {
  children: React.ReactNode; projectId?: string; projectName?: string; action?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <div className="app-shell">
    <aside className={`sidebar ${open ? "is-open" : ""}`} aria-label="Main navigation">
      <div className="brand-row"><Link href="/" className="wordmark"><Aperture size={28} strokeWidth={1.5} />AnswerLens<span className="wordmark-period">.</span></Link><button aria-label="Close navigation" className="icon-button mobile-only" onClick={() => setOpen(false)}><X size={20} /></button></div>
      <Link className="project-switch" href="/projects"><span className="project-avatar">{projectName?.slice(0, 1).toUpperCase() || "A"}</span><span>{projectName || "Your workspace"}<small>Local workspace</small></span><ChevronDown size={15} /></Link>
      <p className="nav-caption">Research workspace</p>
      <nav>{navigation.map((item) => {
        const Icon = item.icon;
        const href = projectId ? `/projects/${projectId}${item.path ? `/${item.path}` : ""}` : "/projects";
        const isCurrent = item.label !== "Competitors" && (projectId ? pathname === href : item.label === "Overview" && pathname === "/projects");
        if (!item.live || (!projectId && item.label !== "Overview")) return <span key={item.label} className="nav-item unavailable" aria-disabled="true" title={!item.live ? "Available in a later phase" : "Open a project first"}><Icon size={18} strokeWidth={1.5} />{item.label}{!item.live && <span className="soon-label">Later</span>}</span>;
        return <Link key={item.label} href={href} aria-current={isCurrent ? "page" : undefined} className={`nav-item ${isCurrent ? "active" : ""}`} onClick={() => setOpen(false)}><Icon size={18} strokeWidth={1.5} />{item.label}</Link>;
      })}</nav>
      <div className="sidebar-bottom">
        {projectId && <Link href={`/projects/${projectId}/settings`} className="nav-item"><Settings2 size={18} strokeWidth={1.5} />Project settings</Link>}
        <div className="local-note"><span className="status-dot" /><span>Saved on this computer<small>No AI key needed for crawling</small></span></div>
      </div>
    </aside>
    {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <div className="workspace-frame"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-only" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={20} /></button><Link href="/projects">Workspace</Link><span>/</span><span>{projectName || "Projects"}</span></div><div className="topbar-actions"><span className="scope-label">Website research</span>{action || <Link href="/onboarding" className="button secondary small">New project<ArrowUpRight size={15} /></Link>}</div></header>{children}</div>
  </div>;
}
