import { z } from "zod";
import { eq } from "drizzle-orm";
import { database } from "../../db";
import { aiSettings } from "../../db/schema";
import { getProject } from "../../db/repositories/projects";
import { sharedModels } from "./models";
import type { AiSettings, ProviderId } from "./types";

export const settingsSchema = z.object({
  primary: z.enum(["nvidia", "openrouter"]), fallback: z.boolean(), model: z.string().refine((id) => sharedModels.some((m) => m.id === id), "Choose a supported shared model"),
  maxTokens: z.number().int().min(1024).max(8192), temperature: z.number().min(0).max(1), timeoutSeconds: z.number().int().min(15).max(120),
  requestBudget: z.number().int().min(1).max(10000), pageLimit: z.number().int().min(1).max(12),
}).strict();
export const defaults: AiSettings = { primary: "nvidia", fallback: true, model: "nemotron-super", maxTokens: 4096, temperature: 0.1, timeoutSeconds: 60, requestBudget: 50, pageLimit: 6 };
export function getSettings(projectId: string): AiSettings { getProject(projectId); return database().db.select().from(aiSettings).where(eq(aiSettings.projectId, projectId)).get()?.settings || { ...defaults }; }
export function saveSettings(projectId: string, value: unknown) {
  getProject(projectId); const settings = settingsSchema.parse(value), updatedAt = new Date().toISOString();
  database().db.insert(aiSettings).values({ projectId, settings, updatedAt }).onConflictDoUpdate({ target: aiSettings.projectId, set: { settings, updatedAt } }).run();
  return settings;
}
// Server-only imports. Only booleans indicating configuration are sent to the UI.
export function credential(provider: ProviderId) { return (provider === "nvidia" ? process.env.NVIDIA_API_KEY : process.env.OPENROUTER_API_KEY)?.trim() || ""; }
export function configuredKeys() { return { nvidia: !!credential("nvidia"), openrouter: !!credential("openrouter") }; }
export function redact(value: string) { let clean = value; for (const provider of ["nvidia", "openrouter"] as const) { const key = credential(provider); if (key) clean = clean.replaceAll(key, "[REDACTED]"); } return clean; }
