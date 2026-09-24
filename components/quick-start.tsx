"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe2 } from "lucide-react";
import { api } from "@/lib/client";

export function QuickStart() {
  const router = useRouter();
  const [website, setWebsite] = useState(""), [name, setName] = useState(""), [description, setDescription] = useState(""), [audience, setAudience] = useState(""), [market, setMarket] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await api<{ id: string }>("/api/projects/quick-start", { method: "POST", body: JSON.stringify({ website, name, description, audience, market }) }); router.push(`/projects/${result.id}`); }
    catch (error) { setError(error instanceof Error ? error.message : "Couldn't start your analysis."); setBusy(false); }
  }
  return <div className="quick-start"><div className="page-heading compact"><p className="eyebrow">Start with your website</p><h1>One website.<br />A clearer picture.</h1><p>See what AI says about your business and get a clear plan to improve your website. We handle the research.</p></div>
    <form onSubmit={submit} className="panel"><fieldset disabled={busy}><label className="quick-website">Your website<div className="input-with-icon"><Globe2 size={18} /><input autoFocus required maxLength={2048} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourcompany.com" autoCapitalize="none" spellCheck={false} /></div></label>
      <details className="simple-details"><summary>Add context if you want to</summary><p className="helper-note">Optional. Useful when your website does not explain everything.</p><div className="profile-form-grid"><label>Company name<input maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></label><label>Market or region<input maxLength={160} value={market} onChange={(e) => setMarket(e.target.value)} /></label><label className="full-width">What should we know about your product?<textarea maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} /></label><label className="full-width">Who is it for?<input maxLength={500} value={audience} onChange={(e) => setAudience(e.target.value)} /></label></div></details>
      <p className="helper-note">We use up to 25 public pages and any context you add for AI analysis. You can stop at any time.</p>
      {error && <p className="notice" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy ? "Starting your analysis…" : "Analyze website"}<ArrowRight size={16} /></button>
    </fieldset></form></div>;
}
