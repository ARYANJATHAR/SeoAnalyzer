"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
export function DemoButton() {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div><button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const result = await api<{ id: string }>("/api/demo", { method: "POST", body: "{}" }); router.push("/projects/" + result.id + "/visibility"); } catch { setError("Could not open the demo. Try again."); setBusy(false); } }}>{busy ? "Opening…" : "Explore the demo"}</button>{error && <p role="alert">{error}</p>}</div>;
}

