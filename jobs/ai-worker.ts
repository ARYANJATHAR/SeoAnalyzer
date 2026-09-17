import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { and, asc, eq, lt } from "drizzle-orm";
import { database } from "../db";
import { aiUsage, profileJobs } from "../db/schema";
import { runExtraction } from "../lib/profile/runner";
import { ProviderError } from "../lib/ai/provider";

config({ path: [".env.local", ".env"] });
const workerId = randomUUID(); let stopping = false; let active: AbortController | null = null;
for (const name of ["SIGINT", "SIGTERM"] as const) process.on(name, () => { stopping = true; active?.abort(); });
async function main() {
  const { db } = database(); console.log("AnswerLens company-profile worker is ready.");
  while (!stopping) {
    const job = db.transaction((tx) => {
      const cutoff = new Date(Date.now() - 180_000).toISOString();
      const stale = tx.select().from(profileJobs).where(and(eq(profileJobs.status, "running"), lt(profileJobs.heartbeatAt, cutoff))).all();
      for (const old of stale) {
        tx.update(profileJobs).set({ status: "failed", error: "Worker stopped unexpectedly. Saved facts remain available. Start a new extraction to continue.", completedAt: new Date().toISOString() }).where(eq(profileJobs.id, old.id)).run();
        tx.update(aiUsage).set({ status: "interrupted", error: "Worker ended before the provider result was recorded; usage may be unknown.", completedAt: new Date().toISOString() }).where(and(eq(aiUsage.jobId, old.id), eq(aiUsage.status, "pending"))).run();
      }
      if (tx.select().from(profileJobs).where(eq(profileJobs.status, "running")).get()) return null;
      const next = tx.select().from(profileJobs).where(eq(profileJobs.status, "queued")).orderBy(asc(profileJobs.createdAt)).get();
      if (!next) return null;
      return tx.update(profileJobs).set({ status: "running", workerId, heartbeatAt: new Date().toISOString() }).where(eq(profileJobs.id, next.id)).returning().get()!;
    }, { behavior: "immediate" });
    if (!job) { await pause(1000); continue; }
    const controller = new AbortController(); active = controller;
    const heartbeat = setInterval(() => {
      try {
        const current = db.select().from(profileJobs).where(eq(profileJobs.id, job.id)).get();
        if (!current || current.workerId !== workerId || current.status !== "running" || current.cancelRequested) { controller.abort(); return; }
        db.update(profileJobs).set({ heartbeatAt: new Date().toISOString() }).where(and(eq(profileJobs.id, job.id), eq(profileJobs.workerId, workerId))).run();
      } catch { controller.abort(); }
    }, 1000);
    let error: string | null = null, failures = 0;
    try { failures = (await runExtraction(job, controller.signal)).failures; }
    catch (caught) { error = caught instanceof ProviderError ? caught.message : "Extraction interrupted. Saved facts remain available."; }
    finally { clearInterval(heartbeat); active = null; }
    db.transaction((tx) => {
      const current = tx.select().from(profileJobs).where(eq(profileJobs.id, job.id)).get();
      if (current?.workerId === workerId && current.status === "running") tx.update(profileJobs).set({ status: current.cancelRequested ? "cancelled" : error || failures ? current.processed ? "partial" : "failed" : "completed", error, completedAt: new Date().toISOString() }).where(eq(profileJobs.id, job.id)).run();
    }, { behavior: "immediate" });
  }
}
main().catch(() => { console.error("Company-profile worker stopped. Check database availability and restart the worker."); process.exitCode = 1; });
