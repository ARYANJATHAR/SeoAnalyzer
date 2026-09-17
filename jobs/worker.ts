import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { and, asc, eq, lt } from "drizzle-orm";
import { database } from "../db";
import { crawlRuns } from "../db/schema";
import { runCrawl } from "../lib/crawler/runner";
import { runAudit } from "../lib/audit/service";

config({ path: [".env.local", ".env"] });
const workerId = randomUUID();
let stopping = false;
let active: AbortController | null = null;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stopping = true; active?.abort(new Error("Worker stopped. Start a new crawl to continue.")); });

async function main() {
  const { db } = database();
  console.log("AnswerLens crawl worker is ready.");
  while (!stopping) {
    const run = db.transaction((tx) => {
      const expired = new Date(Date.now() - 90_000).toISOString();
      tx.update(crawlRuns).set({ status: "failed", completedAt: new Date().toISOString(), errorSummary: "The crawl worker stopped unexpectedly. Collected pages are preserved; start a new crawl." })
        .where(and(eq(crawlRuns.status, "running"), lt(crawlRuns.heartbeatAt, expired))).run();
      // One active run globally keeps host concurrency bounded even with a second local worker.
      if (tx.select().from(crawlRuns).where(eq(crawlRuns.status, "running")).get()) return null;
      const candidate = tx.select().from(crawlRuns).where(eq(crawlRuns.status, "queued")).orderBy(asc(crawlRuns.createdAt)).get();
      if (!candidate) return null;
      const now = new Date().toISOString();
      return tx.update(crawlRuns).set({ status: "running", workerId, startedAt: now, heartbeatAt: now }).where(eq(crawlRuns.id, candidate.id)).returning().get()!;
    }, { behavior: "immediate" });
    if (!run) { await pause(1000); continue; }
    const controller = new AbortController();
    active = controller;
    const heartbeat = setInterval(() => {
      try {
        const current = db.select().from(crawlRuns).where(eq(crawlRuns.id, run.id)).get();
        if (!current || current.workerId !== workerId || current.status !== "running" || current.cancelRequested) {
          controller.abort(new Error("Crawl cancelled.")); return;
        }
        db.update(crawlRuns).set({ heartbeatAt: new Date().toISOString() }).where(and(eq(crawlRuns.id, run.id), eq(crawlRuns.workerId, workerId))).run();
      } catch { controller.abort(new Error("Worker could not renew its database lease.")); }
    }, 1000);
    let failure: string | null = null;
    try { await runCrawl(run, controller); }
    catch (error) { failure = error instanceof Error ? error.message : "Crawl failed."; }
    finally { clearInterval(heartbeat); active = null; }
    const current = db.select().from(crawlRuns).where(eq(crawlRuns.id, run.id)).get();
    if (current?.workerId === workerId && current.status === "running") {
      db.update(crawlRuns).set({
        status: current.cancelRequested ? "cancelled" : failure ? "failed" : "completed",
        completedAt: new Date().toISOString(), errorSummary: current.cancelRequested ? "Cancelled by user. Collected pages are preserved." : failure || current.errorSummary,
      }).where(eq(crawlRuns.id, run.id)).run();
      try { runAudit(run.id); }
      catch (error) { console.error("Technical audit failed:", error instanceof Error ? error.message : "Unknown audit error"); }
    }
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Worker failed."); process.exitCode = 1; });
