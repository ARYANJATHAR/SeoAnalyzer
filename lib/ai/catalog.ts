import { z } from "zod";
import { sharedModels, endpoints } from "./models";
import { InputError } from "../security/url";

const catalogSchema = z.object({ data: z.array(z.object({ id: z.string(), pricing: z.record(z.string(), z.unknown()).optional(), supported_parameters: z.array(z.string()).optional(), architecture: z.object({ output_modalities: z.array(z.string()).optional() }).optional() })) });
export async function boundedJson(response: Response, limit = 2_000_000): Promise<unknown> {
  const reader = response.body?.getReader(); if (!reader) throw new Error("Empty response");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new Error("Response too large"); } chunks.push(value); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
const zero = (value: unknown) => (typeof value === "number" || typeof value === "string") && String(value).trim() !== "" && Number(value) === 0;
export function isFreeTextModel(model: z.infer<typeof catalogSchema>["data"][number]) {
  const p = model.pricing;
  return !!p && zero(p.prompt) && zero(p.completion) && (p.request === undefined || zero(p.request)) && model.architecture?.output_modalities?.includes("text") === true;
}
export async function fetchCatalog() {
  const catalogs = await Promise.allSettled((["nvidia", "openrouter"] as const).map(async (provider) => {
    const response = await fetch(`${endpoints[provider]}/models`, { signal: AbortSignal.timeout(15_000), redirect: "error", cache: "no-store" });
    if (!response.ok) throw new Error("Catalog unavailable"); return catalogSchema.parse(await boundedJson(response));
  }));
  const nv = catalogs[0].status === "fulfilled" ? catalogs[0].value.data : null;
  const or = catalogs[1].status === "fulfilled" ? catalogs[1].value.data : null;
  return { checkedAt: new Date().toISOString(), nvidiaCount: nv?.length ?? null, openrouterZeroTokenCount: or?.filter((m) => zero(m.pricing?.prompt) && zero(m.pricing?.completion)).length ?? null,
    openrouterFreeTextCount: or?.filter(isFreeTextModel).length ?? null,
    warning: !nv || !or ? "One catalog could not be reached. Unknown availability is not treated as verified." : null,
    models: sharedModels.map((model) => { const row = or?.find((m) => m.id === model.openrouter); return { ...model, nvidiaAvailable: nv ? nv.some((m) => m.id === model.nvidia) : null, openrouterAvailable: or ? !!row && isFreeTextModel(row) : null }; }),
  };
}
export type ModelCatalog = Awaited<ReturnType<typeof fetchCatalog>>;
let cached: { time: number; value: ModelCatalog } | undefined;
export async function getCatalog(refresh = false) {
  if (!refresh && cached && Date.now() - cached.time < 10 * 60_000) return cached.value;
  const value = await fetchCatalog(); cached = { time: Date.now(), value }; return value;
}
export async function configuredModel(id: string) {
  const catalog = await getCatalog(); const model = catalog.models.find((entry) => entry.id === id);
  if (!model) throw new InputError("Choose an available shared model.");
  return model;
}
