"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Globe2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import type { Brand, Project } from "@/db/schema";
import type { ProjectInput } from "@/lib/types";
import { api } from "@/lib/client";

const initial: ProjectInput = { name: "", companyName: "", primaryDomain: "", category: "", description: "", targetCustomer: "", market: "", conversionEvent: "demo", brandAliases: [], productNames: [], pageLimit: 100, excludedPaths: [], competitors: [] };
export function ProjectForm({ project, brands, onSaved }: { project?: Project; brands?: Brand[]; onSaved?: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<ProjectInput>(() => project ? {
    ...project, competitors: (brands || []).filter((brand) => brand.active && brand.kind === "competitor").map(({ name, domain }) => ({ name, domain })),
  } : initial);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [aliases, setAliases] = useState(project?.brandAliases.join(", ") || "");
  const [products, setProducts] = useState(project?.productNames.join(", ") || "");
  const [paths, setPaths] = useState(project?.excludedPaths.join("\n") || "");
  const set = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => { setValues((old) => ({ ...old, [key]: value })); setSaved(false); };
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!project && step < 2) { setStep(step + 1); return; }
    setBusy(true);
    try {
      const input = { ...values, brandAliases: aliases.split(",").map((value) => value.trim()).filter(Boolean), productNames: products.split(",").map((value) => value.trim()).filter(Boolean), excludedPaths: paths.split("\n").map((value) => value.trim()).filter(Boolean) };
      const result = await api<Project>(project ? `/api/projects/${project.id}` : "/api/projects", { method: project ? "PATCH" : "POST", body: JSON.stringify(input) });
      if (project) { setSaved(true); onSaved?.(); }
      else router.push(`/projects/${result.id}/website?setup=1`);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save this project."); }
    finally { setBusy(false); }
  }
  const all = !!project;
  return <div className="form-page">
    {!project && <Link href="/projects" className="back-link"><ArrowLeft size={16} />All projects</Link>}
    <div className="page-heading compact"><p className="eyebrow">{project ? "Project settings" : "A new perspective"}</p><h1>{project ? "Your research, configured." : "Let’s get to know your company."}</h1><p>{project ? "Keep your company details and tracked websites up to date." : "A little context now makes every observation more useful."}</p></div>
    {!all && <ol className="setup-steps">{["Company", "Competitors", "Crawl settings"].map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={index <= step ? "current" : ""}><span>{index < step ? <Check size={14} /> : index + 1}</span>{label}</li>)}</ol>}
    <form onSubmit={submit} className="project-form">
      <fieldset disabled={busy}>
        {(all || step === 0) && <section className="panel form-section"><div className="section-intro"><h2>Company details</h2><p>The business and audience this project will focus on.</p></div><div className="form-grid">
          <label>Project name<input autoFocus={!all} required maxLength={200} value={values.name} onChange={(event) => set("name", event.target.value)} placeholder="e.g. Main website research" /></label>
          <label>Company name<input required maxLength={200} value={values.companyName} onChange={(event) => set("companyName", event.target.value)} placeholder="Your company name" autoComplete="organization" /></label>
          <label className="full-width">Company website<div className="input-with-icon"><Globe2 size={17} /><input required maxLength={2048} value={values.primaryDomain} onChange={(event) => set("primaryDomain", event.target.value)} placeholder="https://yourcompany.com" autoCapitalize="none" spellCheck={false} /></div><small>Use the public website domain, without a specific page path.</small></label>
          <label>Product category<input required maxLength={200} value={values.category} onChange={(event) => set("category", event.target.value)} placeholder="e.g. Customer support software" /></label>
          <label>Primary market<input required maxLength={200} value={values.market} onChange={(event) => set("market", event.target.value)} placeholder="e.g. India, United States, or Global" /></label>
          <label className="full-width">What does your product do?<textarea required maxLength={1000} rows={3} value={values.description} onChange={(event) => set("description", event.target.value)} placeholder="Describe your product in one sentence." /></label>
          <label className="full-width">Who is it for?<input required maxLength={500} value={values.targetCustomer} onChange={(event) => set("targetCustomer", event.target.value)} placeholder="e.g. Support leaders at growing B2B software companies" /></label>
          <label>Primary conversion<select value={values.conversionEvent} onChange={(event) => set("conversionEvent", event.target.value)}>{["demo", "trial", "contact", "purchase", "signup"].map((value) => <option value={value} key={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
          <label>Brand aliases <span className="optional">Optional</span><input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="Separate names with commas" /></label>
          <label className="full-width">Product names <span className="optional">Optional</span><input value={products} onChange={(event) => setProducts(event.target.value)} placeholder="Separate product names with commas" /></label>
        </div></section>}
        {(all || step === 1) && <section className="panel form-section"><div className="section-intro"><h2>Your competitive context</h2><p>Add up to three competitor websites. You can also do this later.</p></div>
          <div className="competitor-fields">{values.competitors.map((competitor, index) => <div key={index} className="competitor-field"><span className="competitor-number">{String(index + 1).padStart(2, "0")}</span><label>Company name<input required maxLength={200} value={competitor.name} onChange={(event) => set("competitors", values.competitors.map((value, i) => i === index ? { ...value, name: event.target.value } : value))} placeholder="Competitor name" /></label><label>Website<input required maxLength={2048} value={competitor.domain} onChange={(event) => set("competitors", values.competitors.map((value, i) => i === index ? { ...value, domain: event.target.value } : value))} placeholder="https://competitor.com" autoCapitalize="none" spellCheck={false} /></label><button type="button" className="icon-button remove-competitor" aria-label={`Remove competitor ${index + 1}`} onClick={() => set("competitors", values.competitors.filter((_, i) => i !== index))}><Trash2 size={17} /></button></div>)}</div>
          {values.competitors.length < 3 && <button type="button" className="button secondary" onClick={() => set("competitors", [...values.competitors, { name: "", domain: "" }])}><Plus size={16} />Add competitor</button>}
          {!values.competitors.length && <p className="helper-note">Your company can be crawled on its own. Competitors are optional.</p>}
        </section>}
        {(all || step === 2) && <section className="panel form-section"><div className="section-intro"><h2>Set your crawl boundaries</h2><p>Choose how much of each website to collect. Access and sitemap discovery come next.</p></div><div className="form-grid">
          <div className="full-width"><span className="field-label" id="page-limit-label">Maximum pages per website</span><div className="page-caps" role="radiogroup" aria-labelledby="page-limit-label">{[25, 50, 100, 250].map((limit) => <label key={limit} className={values.pageLimit === limit ? "selected" : ""}><input type="radio" name="pageLimit" value={limit} checked={values.pageLimit === limit} onChange={() => set("pageLimit", limit)} /><strong>{limit}</strong><span>pages</span></label>)}</div><p className="helper-note">The cap includes failed and skipped page attempts. Discovery requests are separate and bounded.</p></div>
          <label className="full-width">Excluded paths <span className="optional">Optional</span><textarea rows={3} value={paths} onChange={(event) => setPaths(event.target.value)} placeholder={"/account\n/login"} spellCheck={false} /><small>One path per line, starting with /. Each excludes that path and its children on every tracked website.</small></label>
        </div><div className="inline-note"><Globe2 size={19} /><p>Only public pages are fetched. Each website’s robots rules are checked before crawling. No AI API calls are made in this phase.</p></div></section>}
      </fieldset>
      {error && <div className="notice" role="alert">{error}</div>}
      {saved && <div className="notice success" role="status"><Check size={17} />Settings saved. Existing crawl history has been preserved.</div>}
      <div className="form-footer"><div>{!all && step > 0 && <button disabled={busy} type="button" className="button ghost" onClick={() => { setStep(step - 1); setError(""); }}><ArrowLeft size={16} />Back</button>}</div><button disabled={busy} type="submit" className="button primary">{busy ? <LoaderCircle className="spin" size={16} /> : null}{busy ? "Saving project…" : all ? "Save settings" : step === 2 ? "Create project" : "Continue"}{!busy && <ArrowRight size={16} />}</button></div>
    </form>
  </div>;
}
