import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function normalizeUrl(value: string, base?: string): string {
  let url: URL;
  try { url = new URL(value, base); } catch { throw new InputError("Enter a valid website URL."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new InputError("Only HTTP and HTTPS websites are supported.");
  if (url.username || url.password) throw new InputError("Website URLs cannot contain credentials.");
  if (url.port && !["80", "443"].includes(url.port)) throw new InputError("Only standard web ports (80 and 443) are supported.");
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!url.hostname) throw new InputError("A website hostname is required.");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|msclkid$|dclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

export function domainKey(value: string): string {
  return new URL(normalizeUrl(value)).hostname.replace(/^www\./, "");
}

export function sameDomain(left: string, right: string): boolean {
  try { return domainKey(left) === domainKey(right); } catch { return false; }
}

export function publicAddress(address: string): boolean {
  try {
    // process() converts IPv4-mapped IPv6 before range classification.
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch { return false; }
}

export async function resolvePublic(value: string): Promise<{ address: string; family: number }[]> {
  const url = new URL(normalizeUrl(value));
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.test|.*\.invalid)$/i.test(hostname) || hostname === "metadata.google.internal") {
    throw new InputError("Use a publicly accessible website. Local and private networks are blocked.");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await (async () => {
    if (isIP(hostname)) return [{ address: hostname, family: isIP(hostname) }];
    try {
      return await Promise.race([
        lookup(hostname, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new InputError("Website DNS lookup timed out.")), 5000); }),
      ]);
    } catch { throw new InputError("The website hostname could not be resolved."); }
    finally { clearTimeout(timer); }
  })();
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
    throw new InputError("This URL resolves to a private, reserved, or unsafe network address.");
  }
  return addresses;
}

export function excluded(url: string, paths: string[]): boolean {
  const pathname = new URL(url).pathname;
  let decoded = pathname;
  try { decoded = decodeURIComponent(pathname); } catch { /* Preserve malformed paths as supplied. */ }
  return paths.some((path) => [pathname, decoded].some((candidate) => candidate === path || candidate.startsWith(path.endsWith("/") ? path : `${path}/`)));
}

export function isPageCandidate(value: string): boolean {
  return !/\.(?:avif|bmp|css|csv|docx?|eot|gif|gz|ico|jpe?g|js|json|map|m4a|mov|mp[34]|ogg|otf|pdf|png|pptx?|rar|rss|svg|tar|ttf|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)$/i.test(new URL(value).pathname);
}
