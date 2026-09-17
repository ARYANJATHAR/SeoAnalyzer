"use client";
import { useState } from "react";
import { Check, RefreshCw, ShieldCheck } from "lucide-react";
import type { UsageSnapshot } from "@/lib/profile/service";
import type { ModelCatalog } from "@/lib/ai/catalog";
import type { AiSettings, ProviderId } from "@/lib/ai/types";
import { api, dateLabel } from "@/lib/client";

export type AiOverview = UsageSnapshot & { catalog: ModelCatalog };
export function AiSettingsPanel({ projectId, initial, onSaved }: { projectId: string; initial: AiOverview; onSaved: () => void }) {
  const [settings, setSettings] = useState<AiSettings>(initial.settings);
  const [catalog, setCatalog] = useState(initial.catalog);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function save() {
    setBusy("save"); setError(""); setNotice("");
    try { await api(`/api/projects/${projectId}/ai`, { method: "PATCH", body: JSON.stringify(settings) }); setNotice("AI settings saved."); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save settings."); } finally { setBusy(""); }
  }
  async function validate(provider: ProviderId) {
    setBusy(provider); setError(""); setNotice("");
    try { const result = await api<{ model: string }>(`/api/projects/${projectId}/ai/validate`, { method: "POST", body: JSON.stringify({ provider }) }); setNotice(`${provider === "nvidia" ? "NVIDIA" : "OpenRouter"} accepted a request for ${result.model}.`); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : "Credential validation failed."); onSaved(); } finally { setBusy(""); }
  }
  async function refreshCatalog() {
    setBusy("catalog"); setError("");
    try { setCatalog(await api<ModelCatalog>(`/api/projects/${projectId}/ai/catalog`, { method: "POST", body: "{}" })); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not refresh catalog."); } finally { setBusy(""); }
  }
  const field = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => setSettings((previous) => ({ ...previous, [key]: value }));
  return <details className="panel profile-settings" open><summary>AI providers & request budget</summary>
    <p className="helper-note">Add keys to <code>.env.local</code> on the server and restart the app and workers. This page never receives or stores the keys. NVIDIA provides free development endpoints; OpenRouter selections use free routes. Account limits still apply.</p>
    <div className="provider-cards">{(["nvidia", "openrouter"] as const).map((provider) => <div className="provider-card" key={provider}><h3>{provider === "nvidia" ? "NVIDIA" : "OpenRouter"}</h3><p><span className="badge">{initial.keys[provider] ? "Key configured" : "Key missing"}</span></p><code>{provider === "nvidia" ? "NVIDIA_API_KEY" : "OPENROUTER_API_KEY"}</code><a href={provider === "nvidia" ? "https://build.nvidia.com" : "https://openrouter.ai/settings/keys"} target="_blank" rel="noreferrer" className="text-link">Get an API key ↗</a><button className="button secondary small" disabled={!!busy || !initial.keys[provider]} onClick={() => validate(provider)}><ShieldCheck size={14} />{busy === provider ? "Validating…" : "Validate saved configuration"}</button></div>)}</div>
    <p className="helper-note">Validation sends a tiny inference request using your saved model and counts against the project budget. Save changes before validating.</p>
    <div className="profile-form-grid">
      <label>Primary provider<select value={settings.primary} onChange={(e) => field("primary", e.target.value as ProviderId)}><option value="nvidia">NVIDIA</option><option value="openrouter">OpenRouter</option></select></label>
      <label>Shared model<select value={settings.model} onChange={(e) => field("model", e.target.value)}>{catalog.models.map((model) => <option key={model.id} value={model.id} disabled={model.nvidiaAvailable !== true || model.openrouterAvailable !== true}>{model.name}{model.nvidiaAvailable === true && model.openrouterAvailable === true ? "" : " — availability not verified"}</option>)}</select></label>
      <label>Maximum output tokens<input type="number" min={1024} max={8192} value={settings.maxTokens} onChange={(e) => field("maxTokens", Number(e.target.value))} /></label>
      <label>Temperature<input type="number" min={0} max={1} step={0.1} value={settings.temperature} onChange={(e) => field("temperature", Number(e.target.value))} /></label>
      <label>Timeout per attempt (seconds)<input type="number" min={15} max={120} value={settings.timeoutSeconds} onChange={(e) => field("timeoutSeconds", Number(e.target.value))} /></label>
      <label>Total project request budget<input type="number" min={1} max={10000} value={settings.requestBudget} onChange={(e) => field("requestBudget", Number(e.target.value))} /></label>
      <label>Maximum pages per extraction<input type="number" min={1} max={12} value={settings.pageLimit} onChange={(e) => field("pageLimit", Number(e.target.value))} /></label>
    </div>
    <label className="profile-checkbox"><input type="checkbox" checked={settings.fallback} onChange={(e) => field("fallback", e.target.checked)} />Use the other provider as backup for the same shared model</label>
    <p className="helper-note">Backup can handle credential, quota, rate-limit and temporary endpoint failures. It never switches to a paid model. Some free OpenRouter routes are hosted by NVIDIA, so this is not independent infrastructure redundancy. Every actual attempt is recorded, including retries and backup use.</p>
    <p className="helper-note">Catalog checked {dateLabel(catalog.checkedAt)}: {catalog.openrouterZeroTokenCount ?? "Unknown"} OpenRouter entries with zero token prices; {catalog.openrouterFreeTextCount ?? "unknown"} text-output entries with no listed request charge; {catalog.nvidiaCount ?? "unknown"} NVIDIA catalog entries (including specialized models). {catalog.models.filter((m) => m.nvidiaAvailable && m.openrouterAvailable).length} curated shared choices verified. Counts are catalog observations, not account-specific access guarantees.</p>
    {catalog.warning && <p className="notice">{catalog.warning}</p>}{error && <p className="notice" role="alert">{error}</p>}{notice && <p role="status" className="notice success"><Check size={14} />{notice}</p>}
    <div className="actions"><button className="button primary small" disabled={!!busy} onClick={save}>{busy === "save" ? "Saving…" : "Save AI settings"}</button><button className="button ghost small" disabled={!!busy} onClick={refreshCatalog}><RefreshCw size={14} />Refresh model availability</button></div>
  </details>;
}
