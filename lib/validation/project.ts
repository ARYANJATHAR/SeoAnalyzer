import { z } from "zod";
import { domainKey, InputError, normalizeUrl, resolvePublic } from "../security/url";

const line = z.string().trim().min(1).max(200);
export const projectInput = z.object({
  name: line, companyName: line, primaryDomain: z.string().trim().max(2048),
  category: line, description: z.string().trim().min(1).max(1000), targetCustomer: z.string().trim().min(1).max(500), market: line,
  conversionEvent: z.enum(["trial", "demo", "contact", "purchase", "signup"]).default("demo"),
  brandAliases: z.array(line).max(20).default([]), productNames: z.array(line).max(20).default([]),
  pageLimit: z.union([z.literal(25), z.literal(50), z.literal(100), z.literal(250)]).default(100),
  excludedPaths: z.array(z.string().trim().min(1).max(300).regex(/^\//, "Excluded paths must start with /.")).max(30).default([]),
  competitors: z.array(z.object({ name: line, domain: z.string().trim().max(2048) })).max(3).default([]),
});

export async function validateProject(input: unknown) {
  const data = projectInput.parse(input);
  function site(value: string) {
    const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
    const url = new URL(normalizeUrl(withProtocol));
    if (url.pathname !== "/" || url.search) throw new InputError("Enter a website domain without a page path or query.");
    return url.origin;
  }
  data.primaryDomain = site(data.primaryDomain);
  data.competitors = data.competitors.map((item) => ({ ...item, domain: site(item.domain) }));
  const urls = [data.primaryDomain, ...data.competitors.map((item) => item.domain)];
  if (new Set(urls.map(domainKey)).size !== urls.length) throw new InputError("The company and competitor domains must all be different.");
  await Promise.all(urls.map(resolvePublic));
  return data;
}
