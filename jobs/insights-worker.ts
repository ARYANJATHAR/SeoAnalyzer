import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { and, asc, eq, lt } from "drizzle-orm";
import { database } from "../db";
import { aiUsage, contentRuns, experimentAnswers, experiments } from "../db/schema";
import { executeContent, executeExperiment } from "../lib/insights/runner";
config({ path: [".env.local", ".env"] });
const workerId = randomUUID(); let stopping = false, active: AbortController | null = null;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stopping = true; active?.abort(); });
async function main() {
  const { db } = database(); console.log("AnswerLens insights worker is ready.");
  while (!stopping) {
    const job = db.transaction((tx) => {
      const cutoff = new Date(Date.now() - 180000).toISOString();
      for (const old of tx.select().from(experiments).where(and(eq(experiments.status, "running"), lt(experiments.heartbeatAt, cutoff))).all()) {
        tx.update(experiments).set({ status: old.cancelRequested ? "cancelled" : "partial", error: "Worker interrupted. Resume to continue.", completedAt: new Date().toISOString() }).where(eq(experiments.id, old.id)).run();
        tx.update(aiUsage).set({ status: "interrupted", completedAt: new Date().toISOString() }).where(and(eq(aiUsage.experimentId, old.id), eq(aiUsage.status, "pending"))).run();
      }
      for (const old of tx.select().from(contentRuns).where(and(eq(contentRuns.status, "running"), lt(contentRuns.heartbeatAt, cutoff))).all()) {
        tx.update(contentRuns).set({ status: old.cancelRequested ? "cancelled" : "partial", error: "Worker interrupted. Resume to continue.", completedAt: new Date().toISOString() }).where(eq(contentRuns.id, old.id)).run();
        tx.update(aiUsage).set({ status: "interrupted", completedAt: new Date().toISOString() }).where(and(eq(aiUsage.contentRunId, old.id), eq(aiUsage.status, "pending"))).run();
      }
      if (tx.select().from(experiments).where(eq(experiments.status, "running")).get() || tx.select().from(contentRuns).where(eq(contentRuns.status, "running")).get()) return null;
      const e = tx.select().from(experiments).where(eq(experiments.status, "queued")).orderBy(asc(experiments.createdAt)).get();
      const c = tx.select().from(contentRuns).where(eq(contentRuns.status, "queued")).orderBy(asc(contentRuns.createdAt)).get();
      if (e && (!c || e.createdAt <= c.createdAt)) return { kind: "experiment" as const, row: tx.update(experiments).set({ status: "running", workerId, heartbeatAt: new Date().toISOString() }).where(eq(experiments.id, e.id)).returning().get()! };
      if (c) return { kind: "content" as const, row: tx.update(contentRuns).set({ status: "running", workerId, heartbeatAt: new Date().toISOString() }).where(eq(contentRuns.id, c.id)).returning().get()! };
      return null;
    }, { behavior: "immediate" });
    if (!job) { await pause(1000); continue; }
    const controller = new AbortController(); active = controller;
    const heartbeat = setInterval(() => {
      try {
        if (job.kind === "experiment") {
          const current = db.select().from(experiments).where(eq(experiments.id, job.row.id)).get();
          if (!current || current.workerId !== workerId || current.status !== "running" || current.cancelRequested) { controller.abort(); return; }
          db.update(experiments).set({ heartbeatAt: new Date().toISOString() }).where(and(eq(experiments.id, current.id), eq(experiments.workerId, workerId), eq(experiments.status, "running"))).run();
        } else {
          const current = db.select().from(contentRuns).where(eq(contentRuns.id, job.row.id)).get();
          if (!current || current.workerId !== workerId || current.status !== "running" || current.cancelRequested) { controller.abort(); return; }
          db.update(contentRuns).set({ heartbeatAt: new Date().toISOString() }).where(and(eq(contentRuns.id, current.id), eq(contentRuns.workerId, workerId), eq(contentRuns.status, "running"))).run();
        }
      } catch { controller.abort(); }
    }, 1000);
    let error: string | null = null;
    try { if (job.kind === "experiment") await executeExperiment(job.row, controller.signal); else await executeContent(job.row, controller.signal); }
    catch { error = "Work stopped before every item finished. Saved results remain available; resume to continue."; }
    finally { clearInterval(heartbeat); active = null; }
    db.transaction((tx) => {
      const now = new Date().toISOString();
      if (job.kind === "experiment") {
        const row = tx.select().from(experiments).where(eq(experiments.id, job.row.id)).get();
        if (row?.status !== "running" || row.workerId !== workerId) return;
        const answers = tx.select().from(experimentAnswers).where(eq(experimentAnswers.experimentId, row.id)).all();
        tx.update(experiments).set({ status: row.cancelRequested ? "cancelled" : answers.length > 0 && answers.every((a) => a.status === "completed") ? "completed" : "partial", error, completedAt: now }).where(eq(experiments.id, row.id)).run();
      } else {
        const row = tx.select().from(contentRuns).where(eq(contentRuns.id, job.row.id)).get();
        if (row?.status !== "running" || row.workerId !== workerId) return;
        tx.update(contentRuns).set({ status: row.cancelRequested ? "cancelled" : row.result.pages.length === row.context.pages.length && row.result.pages.every((p) => p.status === "completed") ? "completed" : "partial", error, completedAt: now }).where(eq(contentRuns.id, row.id)).run();
      }
    }, { behavior: "immediate" });
  }
}
main().catch(() => { console.error("Insights worker stopped. Check local storage and restart it."); process.exitCode = 1; });

