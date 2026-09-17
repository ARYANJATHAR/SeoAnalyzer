import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { database } from "../../db";
import type { Redirect } from "../types";
import { InputError, normalizeUrl, resolvePublic, sameDomain } from "../security/url";

function userAgent() {
  const informationUrl = process.env.CRAWLER_INFORMATION_URL;
  return `AnswerLensBot/1.0${informationUrl && /^https?:\/\/[^\s]+$/.test(informationUrl) ? ` (+${informationUrl})` : ""}`;
}
export const ROBOT_AGENT = "AnswerLensBot";
async function throttle(url: string, delay: number, signal?: AbortSignal) {
  const key = new URL(url).hostname;
  if (!Number.isFinite(delay) || delay > 60_000) throw new InputError("This website requests a crawl delay greater than the local crawler's 60-second limit. No page request was sent.");
  delay = Math.max(250, delay);
  const { sqlite } = database();
  while (true) {
    signal?.throwIfAborted();
    const token = sqlite.transaction(() => {
      const now = Date.now();
      sqlite.prepare("DELETE FROM host_requests WHERE expires_at < ?").run(now);
      sqlite.prepare("INSERT OR IGNORE INTO host_limits(hostname) VALUES (?)").run(key);
      const lane = sqlite.prepare("SELECT last_start, next_start FROM host_limits WHERE hostname=?").get(key) as { last_start: number; next_start: number };
      const { count } = sqlite.prepare("SELECT COUNT(*) AS count FROM host_requests WHERE hostname=?").get(key) as { count: number };
      if (count >= 3 || Math.max(lane.next_start, lane.last_start + delay) > now) return null;
      const id = randomUUID();
      // Lease outlives the 5-second DNS and 12-second HTTP deadlines; crashes release it automatically.
      sqlite.prepare("INSERT INTO host_requests VALUES (?,?,?)").run(id, key, now + 30_000);
      sqlite.prepare("UPDATE host_limits SET last_start=?, next_start=? WHERE hostname=?").run(now, now + delay, key);
      return id;
    }).immediate();
    if (token) return () => { sqlite.prepare("DELETE FROM host_requests WHERE id=?").run(token); };
    await pause(100, undefined, { signal });
  }
}

export type ResponseData = { url: string; status: number; headers: http.IncomingHttpHeaders; body: string; redirects: Redirect[] };
export class CrawlFetchError extends InputError {
  constructor(message: string, public redirects: Redirect[], public lastUrl: string | null, public lastStatus: number | null) { super(message); }
}

async function oneRequest(url: string, selected: { address: string; family: number }, signal?: AbortSignal, kind: "html" | "text" = "html") {
  signal?.throwIfAborted();
  return new Promise<Omit<ResponseData, "redirects">>((resolve, reject) => {
    const target = new URL(url);
    const send = target.protocol === "https:" ? https.request : http.request;
    const request = send(target, {
      // A concrete address family already disables Node's family auto-selection.
      method: "GET", agent: false, signal, family: selected.family,
      headers: { "User-Agent": userAgent(), Accept: kind === "html" ? "text/html,application/xhtml+xml" : "text/plain,application/xml,text/xml", "Accept-Encoding": "identity" },
      // Pin the verified DNS result to the actual connection. TLS still validates the original hostname.
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family),
    }, (response) => {
      const status = response.statusCode || 0;
      const contentType = String(response.headers["content-type"] || "").toLowerCase();
      if ([301, 302, 303, 307, 308].includes(status) || status >= 400 || (kind === "html" && !/^(text\/html|application\/xhtml\+xml)(;|$)/.test(contentType))) {
        resolve({ url, status, headers: response.headers, body: "" });
        response.destroy();
        return;
      }
      if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
        response.destroy(); reject(new InputError("The server ignored the uncompressed response request.")); return;
      }
      const limit = 3 * 1024 * 1024;
      if (Number(response.headers["content-length"] || 0) > limit) {
        response.destroy(); reject(new InputError("Response exceeds the 3 MB limit.")); return;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > limit) { response.destroy(new InputError("Response exceeds the 3 MB limit.")); return; }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({ url, status, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    const timer = setTimeout(() => request.destroy(new InputError("Request timed out after 12 seconds.")), 12_000);
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    request.end();
  });
}

export async function safeFetch(value: string, options: {
  scope: string; signal?: AbortSignal; delay?: number; kind?: "html" | "text";
  allow?: (url: string) => boolean | Promise<boolean>;
  delayFor?: (url: string) => number | Promise<number>;
}): Promise<ResponseData> {
  let url = normalizeUrl(value);
  const redirects: Redirect[] = [];
  const seen = new Set<string>();
  let lastUrl: string | null = null;
  let lastStatus: number | null = null;
  try { for (let hop = 0; hop <= 5; hop++) {
    options.signal?.throwIfAborted();
    if (!sameDomain(url, options.scope)) throw new InputError("A redirect or URL points outside the selected website.");
    if (options.allow && !await options.allow(url)) throw new InputError("Blocked by robots.txt or an excluded path.");
    if (seen.has(url)) throw new InputError("Redirect loop detected.");
    seen.add(url);
    const delay = options.delayFor ? await options.delayFor(url) : options.delay || 250;
    // Resolve before reserving a start slot so variable DNS latency cannot bunch up requests.
    const [selected] = await resolvePublic(url);
    const release = await throttle(url, delay, options.signal);
    let response: Omit<ResponseData, "redirects">;
    try { response = await oneRequest(url, selected, options.signal, options.kind); } finally { release(); }
    lastUrl = response.url; lastStatus = response.status;
    if (![301, 302, 303, 307, 308].includes(response.status)) return { ...response, redirects };
    const location = response.headers.location;
    if (!location) throw new InputError("Redirect response has no destination.");
    const next = normalizeUrl(location, url);
    redirects.push({ url, status: response.status, destination: next });
    url = next;
  }
  throw new InputError("The website exceeded the five-redirect limit.");
  } catch (error) {
    options.signal?.throwIfAborted();
    throw new CrawlFetchError(error instanceof Error ? error.message : "Request failed.", redirects, lastUrl, lastStatus);
  }
}
