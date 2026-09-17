import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { database } from "@/db";
import { crawlRuns, pages } from "@/db/schema";
import { getProject, listProjects, pageInventory, projectSnapshot, saveProject } from "@/db/repositories/projects";
import { createPreview, queueCrawl, cancelCrawl } from "@/lib/crawler/service";
import { InputError } from "@/lib/security/url";
import { validateProject } from "@/lib/validation/project";
import { getIssue, pageAudit, projectAudits, runAudit } from "@/lib/audit/service";
import { getCatalog } from "@/lib/ai/catalog";
import { saveSettings } from "@/lib/ai/config";
import { validateCredential } from "@/lib/ai/provider";
import { addFact, cancelExtraction, extractionPreview, factHistory, profileSnapshot, queueExtraction, reviewFact, usageSnapshot } from "@/lib/profile/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ path: string[] }> };

function protectLocalRequest(request: NextRequest) {
  // Next may construct its internal URL with the bind address even when the browser uses localhost.
  const host = request.headers.get("host") || "";
  let browserUrl: URL;
  try { browserUrl = new URL(`${request.nextUrl.protocol}//${host}`); }
  catch { throw new InputError("Invalid local request host.", 403); }
  if (browserUrl.host !== host || !["localhost", "127.0.0.1", "[::1]"].includes(browserUrl.hostname)) throw new InputError("This version of AnswerLens is available on localhost only.", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== browserUrl.origin) throw new InputError("Cross-origin requests are not allowed.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new InputError("Cross-site requests are not allowed.", 403);
}

async function body(request: NextRequest): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new InputError("Send a JSON request body.", 415);
  if (Number(request.headers.get("content-length") || 0) > 32_768) throw new InputError("Request body is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32_768) { await reader.cancel(); throw new InputError("Request body is too large.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new InputError("Invalid JSON body."); }
}

async function handle(request: NextRequest, context: Context) {
  try {
    protectLocalRequest(request);
    const { path } = await context.params;
    const [resource, id, action, subaction] = path;
    const method = request.method;
    const { db } = database();
    let result: unknown;
    let status = 200;
    if (resource === "projects" && id && action === "ai" && path.length === 3 && method === "GET") result = { ...usageSnapshot(id), catalog: await getCatalog() };
    else if (resource === "projects" && id && action === "ai" && path.length === 3 && method === "PATCH") result = saveSettings(id, await body(request));
    else if (resource === "projects" && id && action === "ai" && subaction === "catalog" && path.length === 4 && method === "POST") { getProject(id); await body(request); result = await getCatalog(true); }
    else if (resource === "projects" && id && action === "ai" && subaction === "validate" && path.length === 4 && method === "POST") {
      const input = z.object({ provider: z.enum(["nvidia", "openrouter"]) }).strict().parse(await body(request));
      result = await validateCredential(id, input.provider, request.signal);
    } else if (resource === "projects" && id && action === "profile" && path.length === 3 && method === "GET") result = profileSnapshot(id, request.nextUrl.searchParams.get("brandId") || undefined);
    else if (resource === "projects" && id && action === "profile" && subaction === "preview" && path.length === 4 && method === "GET") result = extractionPreview(id, request.nextUrl.searchParams.get("crawlId") || "");
    else if (resource === "projects" && id && action === "profile" && subaction === "extract" && path.length === 4 && method === "POST") { result = queueExtraction(id, await body(request)); status = 202; }
    else if (resource === "profile-jobs" && id && action === "cancel" && path.length === 3 && method === "POST") { await body(request); result = cancelExtraction(id); }
    else if (resource === "projects" && id && action === "facts" && path.length === 3 && method === "POST") { result = addFact(id, await body(request)); status = 201; }
    else if (resource === "facts" && id && path.length === 2 && method === "PATCH") result = reviewFact(id, await body(request));
    else if (resource === "facts" && id && action === "history" && path.length === 3 && method === "GET") result = factHistory(id);
    else if (path.length === 1 && resource === "projects" && method === "GET") result = listProjects();
    else if (path.length === 1 && resource === "projects" && method === "POST") {
      result = saveProject(await validateProject(await body(request))); status = 201;
    } else if (resource === "projects" && id && path.length === 2 && method === "GET") result = getProject(id);
    else if (resource === "projects" && id && path.length === 2 && method === "PATCH") result = saveProject(await validateProject(await body(request)), id);
    else if (resource === "projects" && id && action === "summary" && path.length === 3 && method === "GET") result = projectSnapshot(id);
    else if (resource === "projects" && id && action === "audits" && path.length === 3 && method === "GET") {
      const params = request.nextUrl.searchParams;
      result = projectAudits(id, { runId: params.get("runId") || undefined, brandId: params.get("brandId") || undefined, severity: params.get("severity") || undefined, category: params.get("category") || undefined, ruleId: params.get("ruleId") || undefined, query: params.get("query") || undefined, page: Number(params.get("page") || 1) });
    }
    else if (resource === "projects" && id && action === "pages" && path.length === 3 && method === "GET") result = pageInventory(id, request.nextUrl.searchParams.get("runId") || undefined);
    else if (resource === "projects" && id && action === "crawls" && subaction === "preview" && path.length === 4 && method === "POST") {
      const input = z.object({ brandId: z.string().uuid() }).parse(await body(request));
      result = await createPreview(id, input.brandId);
    } else if (resource === "projects" && id && action === "crawls" && path.length === 3 && method === "POST") {
      const input = z.object({ previewId: z.string().uuid() }).parse(await body(request));
      result = queueCrawl(id, input.previewId); status = 202;
    } else if (resource === "crawls" && id && path.length === 2 && method === "GET") {
      const run = db.select().from(crawlRuns).where(eq(crawlRuns.id, id)).get();
      if (!run) throw new InputError("Crawl not found.", 404);
      result = { ...run, siteSignals: null, discovery: { ...run.discovery, robotsText: "", pageUrls: [] } };
    } else if (resource === "crawls" && id && action === "cancel" && path.length === 3 && method === "POST") {
      await body(request); cancelCrawl(id); result = { cancelled: true };
    } else if (resource === "crawls" && id && action === "audit" && path.length === 3 && method === "POST") {
      await body(request); result = runAudit(id);
    } else if (resource === "pages" && id && action === "audit" && path.length === 3 && method === "GET") result = pageAudit(id);
    else if (resource === "issues" && id && path.length === 2 && method === "GET") result = getIssue(id);
    else if (resource === "pages" && id && path.length === 2 && method === "GET") {
      result = db.select().from(pages).where(eq(pages.id, id)).get();
      if (!result) throw new InputError("Page not found.", 404);
    } else throw new InputError("Endpoint not found.", 404);
    return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" ") }, { status: 400 });
    if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return NextResponse.json({ error: "Website discovery timed out. Try again or check the website's availability." }, { status: 504 });
    console.error("AnswerLens request failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "The request could not be completed. Check the local application output and try again." }, { status: 500 });
  }
}
export { handle as GET, handle as POST, handle as PATCH };
