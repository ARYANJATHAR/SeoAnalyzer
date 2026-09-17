"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronRight, CircleAlert, FileText, Globe2, LoaderCircle, RefreshCw, Search, Square, X } from "lucide-react";
import type { ProjectSnapshot } from "@/db/repositories/projects";
import type { PageSummary } from "@/db/schema";
import type { createPreview } from "@/lib/crawler/service";
import { api, dateLabel } from "@/lib/client";
import { Shell } from "./shell";
import { ProjectForm } from "./project-form";
import { PageEvidence } from "./page-evidence";
import { AuditPanel } from "./audit-panel";

type Preview = Awaited<ReturnType<typeof createPreview>>;
type View = "overview" | "website" | "settings";

export function Workspace({ projectId, view }: { projectId: string; view: View }) {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [inventory, setInventory] = useState<PageSummary[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [runFilter, setRunFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [evidenceTab, setEvidenceTab] = useState<"Content" | "Audit">("Content");
  const [pageNumber, setPageNumber] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const [next, collected] = await Promise.all([
          api<ProjectSnapshot>(`/api/projects/${projectId}/summary`, { signal: controller.signal }),
          api<PageSummary[]>(`/api/projects/${projectId}/pages${runFilter ? `?runId=${runFilter}` : ""}`, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setSnapshot(next); setInventory(collected); setError("");
        if (next.runs.some((run) => ["queued", "running"].includes(run.status))) timer = setTimeout(poll, 2000);
      } catch (error) {
        if (!controller.signal.aborted) { setError(error instanceof Error ? error.message : "Could not load the workspace."); timer = setTimeout(poll, 5000); }
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, runFilter, refreshKey]);

  async function preview(brandId: string) {
    setBusy(`preview-${brandId}`); setError("");
    setPreviewErrors((previous) => { const next = { ...previous }; delete next[brandId]; return next; });
    setPreviews((previous) => { const next = { ...previous }; delete next[brandId]; return next; });
    try {
      const result = await api<Preview>(`/api/projects/${projectId}/crawls/preview`, { method: "POST", body: JSON.stringify({ brandId }) });
      setPreviews((previous) => ({ ...previous, [brandId]: result }));
    } catch (error) { setPreviewErrors((previous) => ({ ...previous, [brandId]: error instanceof Error ? error.message : "Discovery failed." })); }
    finally { setBusy(null); }
  }
  async function start(brandId: string) {
    const item = previews[brandId];
    if (!item) return;
    setBusy(`start-${brandId}`); setError("");
    try {
      await api(`/api/projects/${projectId}/crawls`, { method: "POST", body: JSON.stringify({ previewId: item.id }) });
      setPreviews((previous) => { const next = { ...previous }; delete next[brandId]; return next; });
      setNotice("Crawl queued. Pages will appear as they are collected."); refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not start crawl."); }
    finally { setBusy(null); }
  }
  async function cancel(id: string) {
    setBusy(`cancel-${id}`);
    try { await api(`/api/crawls/${id}/cancel`, { method: "POST", body: "{}" }); refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not cancel crawl."); }
    finally { setBusy(null); }
  }

  if (!snapshot) return <Shell><main id="main" className="main"><div className="page-heading"><p className="eyebrow">Research workspace</p><h1>Opening your project…</h1></div>{error ? <div className="notice" role="alert">{error}<button className="button secondary" onClick={refresh}>Try again</button></div> : <div className="panel loading-state" aria-busy="true">Loading project details</div>}</main></Shell>;
  const { project, brands, runs } = snapshot;
  const activeBrands = brands.filter((brand) => brand.active);
  const latestRuns = activeBrands.flatMap((brand) => { const run = runs.find((run) => run.brandId === brand.id); return run ? [run] : []; });
  const activeRuns = runs.filter((run) => ["queued", "running"].includes(run.status));
  const fetched = latestRuns.reduce((sum, run) => sum + run.pagesFetched, 0);
  const failed = latestRuns.reduce((sum, run) => sum + run.pagesFailed, 0);
  const filtered = inventory.filter((page) => (!brandFilter || page.brandId === brandFilter) && (!statusFilter || page.status === statusFilter) && `${page.title || ""} ${page.url}`.toLowerCase().includes(query.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(pageNumber, totalPages);
  const visiblePages = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  const brandName = (id: string) => brands.find((brand) => brand.id === id)?.name || "Website";
  const openDiscovery = () => { setShowDiscovery(true); setTimeout(() => document.getElementById("crawl-discovery")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20); };

  return <Shell projectId={projectId} projectName={project.name} action={<button className="button primary small" onClick={openDiscovery}><RefreshCw size={14} />New crawl</button>}><main id="main" className="main">
    {error && <div className="notice" role="alert"><CircleAlert size={18} /><p>{error}</p><button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
    {notice && <div className="notice success" role="status"><Check size={17} /><p>{notice}</p><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={16} /></button></div>}
    {view === "settings" ? <><ProjectForm key={project.id} project={project} brands={brands} onSaved={() => { setPreviews({}); refresh(); }} />{showDiscovery && <p className="notice">Save your settings first, then <Link href={`/projects/${projectId}/website`}>open Website to start a crawl</Link>.</p>}</> : <>
      <div className="page-heading compact"><p className="eyebrow">{view === "website" ? "Website inventory" : "Project overview"}</p><h1>{view === "website" ? "Every page. In perspective." : `A closer look at ${project.companyName}.`}</h1><div className="heading-meta"><a href={project.primaryDomain} target="_blank" rel="noreferrer" className="text-link mono">{new URL(project.primaryDomain).hostname}<ArrowUpRight size={14} /></a><span className="meta-separator" /><span>{runs.length ? `Latest crawl ${dateLabel(runs[0].createdAt)}` : "Ready for your first crawl"}</span></div></div>
      <div className="metrics-strip"><div><span>Pages collected</span><strong>{fetched.toLocaleString()}</strong><small>Latest crawl per tracked website</small></div><div><span>Tracked websites</span><strong>{activeBrands.length.toString().padStart(2, "0")}</strong><small>Your company + {activeBrands.length - 1} competitors</small></div><div><span>Page failures</span><strong>{failed.toString().padStart(2, "0")}</strong><small>{failed ? "Open the inventory to inspect" : "No failures recorded"}</small></div><div><span>Collection status</span><strong className="metric-word">{activeRuns.length ? "In progress" : !runs.length ? "Not started" : latestRuns.some((run) => run.status === "failed") ? "Needs review" : latestRuns.some((run) => run.status === "cancelled") ? "Partial" : fetched ? "Collected" : "No pages"}</strong><small>{project.pageLimit} page cap per website</small></div></div>

      {activeRuns.length > 0 && <section className="panel run-progress" aria-label="Active crawls"><div className="section-heading"><h2>Collecting your evidence</h2><span className="badge"><span className="status-dot" />{activeRuns.length} active</span></div>{activeRuns.map((run) => <div key={run.id} className="progress-row"><div><strong>{brandName(run.brandId)}</strong><p>{run.status === "queued" ? "Queued for the local crawl worker" : `${run.pagesProcessed} / ${run.settings.pageLimit} attempts · ${run.pagesFetched} collected · ${run.pagesFailed} failed · ${run.pagesSkipped} skipped`}</p><small>Discovered {run.pagesDiscovered} candidate pages</small></div><div className="progress-control"><progress max={run.settings.pageLimit} value={run.pagesProcessed} aria-label={`${brandName(run.brandId)} crawl progress`} /><button className="button ghost small" disabled={!!busy || run.cancelRequested} onClick={() => cancel(run.id)}><Square size={12} />{run.cancelRequested ? "Cancelling…" : "Cancel"}</button></div></div>)}<p className="helper-note">Crawling may finish below the page cap when no more eligible pages are found. Queued crawls require the local worker started by npm run dev.</p></section>}

      {(showDiscovery || !runs.length) && <section className="panel discovery-panel" id="crawl-discovery"><div className="section-heading"><div><h2>Discover before you crawl.</h2><p>Check access and sitemaps, then start each website’s crawl.</p></div>{runs.length > 0 && <button className="icon-button" aria-label="Close crawl discovery" onClick={() => setShowDiscovery(false)}><X size={20} /></button>}</div><div className="discovery-settings"><span>Up to <strong>{project.pageLimit} pages</strong> per website</span><span>{project.excludedPaths.length} excluded paths</span><Link href={`/projects/${projectId}/settings`}>Edit settings<ArrowUpRight size={13} /></Link></div>
        {activeBrands.map((brand) => {
          const item = previews[brand.id];
          const activeRun = activeRuns.find((run) => run.brandId === brand.id);
          return <div className="discovery-site" key={brand.id}><div className="site-heading"><div className="site-identity"><span className="project-avatar">{brand.name.slice(0, 1)}</span><div><h3>{brand.name}<span className="badge">{brand.kind === "target" ? "Your company" : "Competitor"}</span></h3><p className="mono">{brand.domain}</p></div></div><button className="button secondary small" disabled={!!busy || !!activeRun} onClick={() => preview(brand.id)}>{busy === `preview-${brand.id}` ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}{busy === `preview-${brand.id}` ? "Discovering…" : activeRun ? "Crawl active" : item ? "Refresh preview" : "Discover website"}</button></div>
            {previewErrors[brand.id] && <div className="notice" role="alert">{previewErrors[brand.id]}</div>}
            {item && <div className="preview-result"><div className="preview-stats"><div><small>Robots access</small><strong>{item.discovery.rootAllowed ? "Homepage allowed" : "Homepage blocked"}</strong><span>{item.discovery.robotsStatus === 200 ? "robots.txt found" : "No robots file (404 / 410)"}</span></div><div><small>Readable sitemaps</small><strong>{item.discovery.sitemapUrls.length}</strong><span>Includes sitemap indexes</span></div><div><small>Discovered page URLs</small><strong>{item.discoveredCount.toLocaleString()}{item.discovery.truncated ? "+" : ""}</strong><span>More may be found through links</span></div></div>{item.discovery.warnings.map((warning, index) => <p className="helper-note wrap" key={index}>{warning}</p>)}
              {item.discovery.sitemapUrls.length > 0 && <details><summary>View discovered sitemaps</summary><ul className="url-list">{item.discovery.sitemapUrls.map((url) => <li key={url}><a href={url} className="mono" target="_blank" rel="noreferrer">{url}</a></li>)}</ul></details>}
              {item.discovery.pageUrls.length > 0 && <details><summary>Preview discovered pages (up to 20)</summary><ul className="url-list">{item.discovery.pageUrls.map((url) => <li key={url}><span className="mono">{url}</span></li>)}</ul></details>}
              <div className="preview-footer"><p>Preview valid for 15 minutes. Permissions are checked again when crawling starts.</p><button className="button primary small" disabled={!!busy || !!activeRun || (!item.discovery.rootAllowed && !item.discoveredCount)} onClick={() => start(brand.id)}>Start crawl<ArrowRight size={15} /></button></div></div>}
          </div>;
        })}
      </section>}

      {view === "overview" && <section className="overview-columns"><div className="panel"><div className="section-heading"><h2>Your research scope</h2><Link href={`/projects/${projectId}/settings`} className="text-link">Edit<ArrowUpRight size={14} /></Link></div><dl className="scope-details"><div><dt>Category</dt><dd>{project.category}</dd></div><div><dt>Audience</dt><dd>{project.targetCustomer}</dd></div><div><dt>Market</dt><dd>{project.market}</dd></div><div><dt>Product</dt><dd>{project.description}</dd></div></dl></div><div className="stone-panel"><FileText size={24} strokeWidth={1.4} /><h2>The source comes first.</h2><p>Your page inventory is the starting point for company facts, technical audits, and AI visibility experiments.</p><Link href={`/projects/${projectId}/website`} className="button primary small">Explore website evidence<ArrowRight size={15} /></Link><small>AI visibility has not been measured in this phase.</small></div></section>}

      <AuditPanel key={`${projectId}-${runFilter}-${brandFilter}`} projectId={projectId} runId={runFilter} brandId={brandFilter} refreshToken={`${refreshKey}-${runs.map((run) => `${run.id}:${run.status}`).join(",")}`} onOpenPage={(id) => { setEvidenceTab("Audit"); setSelectedPage(id); }} scopeControls={<>
        <label>Website<select value={brandFilter} onChange={(event) => { setBrandFilter(event.target.value); setPageNumber(1); }}><option value="">All websites</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}{!brand.active ? " (archived)" : ""}</option>)}</select></label>
        <label>Crawl snapshot<select value={runFilter} onChange={(event) => { setRunFilter(event.target.value); setBrandFilter(""); setPageNumber(1); }}><option value="">Latest crawls</option>{runs.map((run) => <option key={run.id} value={run.id}>{brandName(run.brandId)} · {dateLabel(run.createdAt)} · {run.status}</option>)}</select></label>
      </>} />
      <section className="inventory-section"><div className="section-heading"><div><h2>{view === "overview" ? "Collected pages" : "Page inventory"}<span className="count">{filtered.length}</span></h2><p>{runFilter ? "Pages from the selected crawl." : "Latest crawl for each currently tracked website."}</p></div><button className="button ghost small" onClick={refresh}><RefreshCw size={14} />Refresh</button></div>
        <div className="panel inventory-panel"><div className="table-toolbar"><div className="search-input"><Search size={17} /><input aria-label="Search pages by title or URL" placeholder="Search pages or URLs…" value={query} onChange={(event) => { setQuery(event.target.value); setPageNumber(1); }} /></div><select aria-label="Filter by website" value={brandFilter} onChange={(event) => { setBrandFilter(event.target.value); setPageNumber(1); }}><option value="">All websites</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}{!brand.active ? " (archived)" : ""}</option>)}</select><select aria-label="Filter page status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPageNumber(1); }}><option value="">All statuses</option><option value="fetched">Collected</option><option value="failed">Failed</option><option value="skipped">Skipped</option></select><select aria-label="Select crawl history" value={runFilter} onChange={(event) => { setRunFilter(event.target.value); setBrandFilter(""); setPageNumber(1); }}><option value="">Latest crawls</option>{runs.map((run) => <option key={run.id} value={run.id}>{brandName(run.brandId)} · {dateLabel(run.createdAt)} · {run.status}</option>)}</select></div>
          {visiblePages.length ? <><div className="table-scroll"><table><thead><tr><th>Page</th><th>Website</th><th>Status</th><th className="numeric">Words</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{visiblePages.map((page) => <tr key={page.id}><td><button className="page-open" onClick={() => setSelectedPage(page.id)}><span>{page.title || (page.status === "fetched" ? "Untitled page" : page.error || "Page unavailable")}</span><small className="mono">{page.url}</small></button></td><td><span className="table-brand">{brandName(page.brandId)}</span></td><td><span className={`badge ${page.status === "fetched" ? "success" : ""}`}>{page.status === "fetched" ? <Check size={12} /> : page.status === "failed" ? <CircleAlert size={12} /> : null}{page.status === "fetched" ? "Collected" : page.status}{page.statusCode ? ` · ${page.statusCode}` : ""}</span></td><td className="numeric">{page.wordCount?.toLocaleString() ?? "—"}</td><td><button className="icon-button" aria-label={`View evidence for ${page.url}`} onClick={() => setSelectedPage(page.id)}><ChevronRight size={17} /></button></td></tr>)}</tbody></table></div><div className="table-footer"><span>{(currentPage - 1) * 20 + 1}–{Math.min(currentPage * 20, filtered.length)} of {filtered.length} pages</span><div className="actions"><button className="button ghost small" disabled={currentPage <= 1} onClick={() => setPageNumber(currentPage - 1)}>Previous</button><span>{currentPage} / {totalPages}</span><button className="button ghost small" disabled={currentPage >= totalPages} onClick={() => setPageNumber(currentPage + 1)}>Next</button></div></div></> : <div className="inventory-empty"><Globe2 size={30} strokeWidth={1.25} /><h3>{inventory.length ? "No pages match these filters." : activeRuns.length ? "Your pages are on their way." : "Your page inventory starts here."}</h3><p>{inventory.length ? "Try a different website, status, or search term." : activeRuns.length ? "Collected pages will appear automatically as the crawl progresses." : "Discover a website and start a crawl to collect its pages."}</p>{!inventory.length && !activeRuns.length && <button className="button secondary small" onClick={openDiscovery}>Discover websites<ArrowRight size={15} /></button>}</div>}
        </div>
      </section>

      {runs.length > 0 && <section className="history-section"><div className="section-heading"><h2>Crawl history</h2><span className="subtle">Most recent {Math.min(runs.length, 10)} of {runs.length}{runs.length === 100 ? "+" : ""} runs</span></div><div className="panel history-panel">{runs.slice(0, 10).map((run) => <div className="history-row" key={run.id}><div><strong>{brandName(run.brandId)}</strong><p>{dateLabel(run.createdAt)} · {run.pagesFetched} collected · {run.pagesFailed} failed · {run.pagesSkipped} skipped</p>{run.errorSummary && <p className="run-error">{run.errorSummary}</p>}</div><span className="badge">{run.status}</span><button className="button ghost small" onClick={() => { setPageNumber(1); setRunFilter(run.id); setBrandFilter(""); setStatusFilter(""); setQuery(""); document.querySelector(".inventory-section")?.scrollIntoView({ behavior: "smooth" }); }}>View pages<ArrowRight size={14} /></button></div>)}</div></section>}
      <div className="footnote"><CircleAlert size={16} /><p>Server HTML only. Pages that rely on JavaScript may have limited content. Website collection does not measure AI visibility.</p></div>
    </>}
  </main><PageEvidence key={selectedPage || "closed"} pageId={selectedPage} initialTab={evidenceTab} onClose={() => { setSelectedPage(null); setEvidenceTab("Content"); }} /></Shell>;
}
