import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { and, asc, eq, lt } from "drizzle-orm";
import { database } from "../db";
import { aiUsage, buyerPersonas, questionJobs } from "../db/schema";
import { generateBuyerResearch } from "../lib/questions/runner";
import { ProviderError } from "../lib/ai/provider";
import { advanceResearch } from "../lib/research/service";

config({ path: [".env.local", ".env"] });
const workerId = randomUUID(); let stopping = false, active: AbortController | null = null;
for (const name of ["SIGINT", "SIGTERM"] as const) process.on(name, () => { stopping = true; active?.abort(); });
async function main() {
  const { db } = database(); console.log("AnswerLens buyer-question worker is ready.");
  while (!stopping) {
    await advanceResearch();
    if (stopping) break;
    const job = db.transaction((tx) => {
      const stale = tx.select().from(questionJobs).where(and(eq(questionJobs.status, "running"), lt(questionJobs.heartbeatAt, new Date(Date.now() - 180_000).toISOString()))).all();
      for (const old of stale) {
        tx.update(questionJobs).set({ status: old.cancelRequested ? "cancelled" : "failed", error: "Worker interrupted; saved research remains available.", completedAt: new Date().toISOString() }).where(eq(questionJobs.id, old.id)).run();
        tx.update(aiUsage).set({ status: "interrupted", error: "Worker ended before usage could be recorded.", completedAt: new Date().toISOString() }).where(and(eq(aiUsage.questionJobId, old.id), eq(aiUsage.status, "pending"))).run();
      }
      if (tx.select().from(questionJobs).where(eq(questionJobs.status, "running")).get()) return null;
      const next = tx.select().from(questionJobs).where(eq(questionJobs.status, "queued")).orderBy(asc(questionJobs.createdAt)).get();
      return next ? tx.update(questionJobs).set({ status: "running", workerId, heartbeatAt: new Date().toISOString() }).where(eq(questionJobs.id, next.id)).returning().get()! : null;
    }, { behavior: "immediate" });
    if (!job) { await pause(1000); continue; }
    const controller = new AbortController(); active = controller;
    const heartbeat = setInterval(() => {
      try {
        const current = db.select().from(questionJobs).where(eq(questionJobs.id, job.id)).get();
        if (!current || current.workerId !== workerId || current.status !== "running" || current.cancelRequested) { controller.abort(); return; }
        db.update(questionJobs).set({ heartbeatAt: new Date().toISOString() }).where(and(eq(questionJobs.id, job.id), eq(questionJobs.workerId, workerId))).run();
      } catch { controller.abort(); }
    }, 1000);
    let ready = false, error: string | null = null;
    try { ready = (await generateBuyerResearch(job, controller.signal)).ready; }
    catch (caught) { error = caught instanceof ProviderError ? caught.message : "Buyer-question generation interrupted."; }
    finally { clearInterval(heartbeat); active = null; }
    db.transaction((tx) => {
      const current = tx.select().from(questionJobs).where(eq(questionJobs.id, job.id)).get();
      if (current?.workerId !== workerId || current.status !== "running") return;
      const hasPersonas = !!tx.select().from(buyerPersonas).where(eq(buyerPersonas.projectId, job.projectId)).get();
      tx.update(questionJobs).set({ status: current.cancelRequested ? "cancelled" : ready ? "completed" : current.questionsCreated || hasPersonas ? "partial" : "failed", error: error || (!ready ? "Generation ended before the distinct-question and intent coverage target was reached." : null), completedAt: new Date().toISOString() }).where(eq(questionJobs.id, job.id)).run();
    }, { behavior: "immediate" });
  }
}
main().catch(() => { console.error("Buyer-question worker stopped. Check database availability and restart it."); process.exitCode = 1; });
