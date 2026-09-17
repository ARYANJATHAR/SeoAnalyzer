"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, FileText, X } from "lucide-react";
import type { Page } from "@/db/schema";
import { api, dateLabel } from "@/lib/client";
import type { PageAudit } from "@/lib/audit/service";
import { AuditIssueDetail } from "./audit-issue";

const tabs = ["Content", "Headings", "Links", "Schema", "Metadata", "Audit"] as const;
export function PageEvidence({ pageId, onClose, initialTab = "Content" }: { pageId: string | null; onClose: () => void; initialTab?: "Content" | "Audit" }) {
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]>(initialTab);
  const [audit, setAudit] = useState<PageAudit | null>(null);
  const [auditError, setAuditError] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!pageId) return;
    const controller = new AbortController();
    api<Page>(`/api/pages/${pageId}`, { signal: controller.signal }).then(setPage).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [pageId]);
  useEffect(() => {
    if (!pageId || tab !== "Audit") return;
    const controller = new AbortController();
    api<PageAudit>(`/api/pages/${pageId}/audit`, { signal: controller.signal }).then((value) => { if (!controller.signal.aborted) { setAudit(value); setAuditError(""); } }).catch((error) => { if (!controller.signal.aborted) setAuditError(error.message); });
    return () => controller.abort();
  }, [pageId, tab]);
  return <Dialog.Root open={!!pageId} onOpenChange={(open) => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className="drawer-overlay" /><Dialog.Content className="evidence-drawer" aria-describedby="evidence-description"
    onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
    onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
    <div className="drawer-header"><span className="eyebrow"><FileText size={14} />Page evidence</span><Dialog.Close className="icon-button" aria-label="Close page details"><X size={20} /></Dialog.Close></div>
    <Dialog.Title className="drawer-title">{page?.title || (page ? "Untitled page" : "Page details")}</Dialog.Title>
    <Dialog.Description id="evidence-description">Recorded website content from this crawl. Text is extracted from server HTML.</Dialog.Description>
    {error ? <div role="alert" className="notice">{error}</div> : !page ? <p className="loading-state">Loading page evidence…</p> : <>
      <a className="evidence-url mono" href={page.finalUrl || page.url} target="_blank" rel="noreferrer">{page.finalUrl || page.url}<ArrowUpRight size={16} /></a>
      <div className="evidence-facts"><span className={`badge ${page.status === "fetched" ? "success" : ""}`}>{page.status}</span><span>HTTP {page.statusCode ?? "—"}</span><span>{page.wordCount?.toLocaleString() ?? "—"} words</span><span>{dateLabel(page.fetchedAt)}</span></div>
      {page.error && <div className="notice">{page.error}</div>}
      <div className="evidence-tabs" aria-label="Evidence sections">{tabs.map((item) => <button key={item} className={tab === item ? "selected" : ""} aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
      <div className="evidence-body">
        {tab === "Audit" && <><h3>Technical findings</h3>{auditError ? <p role="alert">{auditError} Switch tabs and return to retry.</p> : !audit ? <p>Loading audit…</p> : !audit.audit ? <p>No audit is saved for this crawl yet. Use “Audit saved pages” in the technical audit section after collection stops.</p> : <><p className="helper-note">{audit.audit.ruleVersion} · evaluated {dateLabel(audit.audit.createdAt)}. Issues belong to this page’s crawl; site-level findings and coverage are in the workspace audit.</p>{audit.issues.length ? audit.issues.map((issue) => <AuditIssueDetail key={issue.id} issue={issue} />) : <p>No page findings recorded. Review coverage for unavailable checks before drawing conclusions.</p>}</>}</>}
        {tab === "Content" && <><h3>Extracted text</h3><p className="helper-note">Scripts, styles, and explicitly hidden elements are removed. CSS visibility and JavaScript rendering are not evaluated.</p><div className="extracted-copy">{page.visibleText || "No HTML text was collected for this page."}</div></>}
        {tab === "Headings" && <><h3>Heading structure <span className="count">{page.headings.length}</span></h3>{page.headings.length ? <ol className="heading-list">{page.headings.map((heading, index) => <li key={index}><span className="mono">H{heading.level}</span><span style={{ paddingLeft: (heading.level - 1) * 8 }}>{heading.text || "Empty heading"}</span></li>)}</ol> : <p>No headings were collected.</p>}</>}
        {tab === "Links" && <>{[["Internal links", page.internalLinks], ["External links", page.externalLinks]].map(([label, links]) => <section key={label as string} className="evidence-section"><h3>{label as string} <span className="count">{(links as string[]).length}</span></h3><ul className="url-list">{(links as string[]).map((url) => <li key={url}><a href={url} target="_blank" rel="noreferrer" className="mono">{url}<ArrowUpRight size={13} /></a></li>)}</ul>{!(links as string[]).length && <p>No links collected.</p>}</section>)}</>}
        {tab === "Schema" && <><h3>JSON-LD blocks <span className="count">{page.structuredData.length}</span></h3>{page.structuredData.length ? page.structuredData.map((schema, index) => <section className="evidence-section" key={index}><span className="badge">{schema.valid ? "Valid JSON" : "Invalid JSON"}</span>{schema.error && <p>{schema.error}</p>}<pre>{JSON.stringify(schema.value, null, 2)}</pre></section>) : <p>No JSON-LD blocks were found.</p>}</>}
        {tab === "Metadata" && <><h3>Recorded metadata</h3><dl className="metadata-list">{[
          ["Requested URL", page.url], ["Final URL", page.finalUrl], ["Canonical URL", page.canonicalUrl], ["Page title", page.title], ["Meta description", page.metaDescription], ["Content type", page.contentType], ["Language", page.language], ["In discovered sitemap", page.inSitemap ? "Yes" : "No"], ["Robots directives", page.robotsDirectives.join("\n")], ["Content hash", page.textHash], ["Observed", page.fetchedAt],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={label?.includes("URL") || label === "Content hash" ? "mono" : ""}>{value || "Not present"}</dd></div>)}</dl><h3>Redirect chain</h3>{page.redirects.length ? <ol className="redirect-list">{page.redirects.map((redirect, index) => <li key={index}><span className="badge">{redirect.status}</span><p className="mono">{redirect.url}</p><p className="mono">→ {redirect.destination}</p></li>)}</ol> : <p>No recorded redirects.</p>}</>}
      </div>
    </>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
