import type { ExperimentAnswer } from "../../db/schema";
import type { TrackedBrand } from "./types";
export const stageWeights: Record<string, number> = { problem_discovery: 1, category_education: 1, solution_research: 2, vendor_comparison: 3, validation_risk: 2, purchase_decision: 3 };
export function proportion(numerator: number, denominator: number) {
  if (!denominator) return { numerator, denominator, value: null, interval: null, confidence: "No eligible evidence" };
  const p = numerator / denominator, z = 1.96, factor = 1 + z * z / denominator;
  const center = (p + z * z / (2 * denominator)) / factor;
  const half = z * Math.sqrt(p * (1 - p) / denominator + z * z / (4 * denominator * denominator)) / factor;
  return { numerator, denominator, value: p, interval: denominator >= 10 ? [Math.max(0, center - half), Math.min(1, center + half)] : null, confidence: denominator < 10 ? "Directional result" : "95% Wilson interval; repeated model answers are not independent market samples" };
}
export function metrics(rows: ExperimentAnswer[], brands: TrackedBrand[]) {
  const eligible = rows.filter((r) => r.status === "completed" && !!r.payload.raw?.trim() && !!r.payload.analysis && !r.payload.truncated);
  const target = brands.find((b) => b.kind === "target");
  const targetHost = target ? new URL(target.domain).hostname.replace(/^www\./, "") : "";
  const hostMatches = (host: string, expected: string) => !!expected && (host === expected || host.endsWith("." + expected));
  const withCitations = eligible.filter((r) => r.payload.citations.length > 0);
  const brandMetrics = brands.map((b) => {
    const appeared = eligible.filter((r) => r.payload.analysis!.brands.some((m) => m.brandId === b.id));
    const recommended = eligible.filter((r) => r.payload.analysis!.brands.some((m) => m.brandId === b.id && m.recommended));
    const positions = recommended.flatMap((r) => r.payload.analysis!.brands.filter((m) => m.brandId === b.id && m.recommendationPosition !== null).map((m) => m.recommendationPosition!));
    const weighted = appeared.reduce((sum, r) => sum + (stageWeights[r.payload.question.stage] || 1), 0);
    const host = new URL(b.domain).hostname.replace(/^www\./, "");
    return { id: b.id, name: b.name, kind: b.kind, mention: proportion(appeared.length, eligible.length), recommendation: proportion(recommended.length, eligible.length),
      citations: proportion(withCitations.filter((r) => r.payload.citations.some((c) => hostMatches(c.domain, host))).length, withCitations.length),
      weighted, position: positions.length ? positions.reduce((a, v) => a + v, 0) / positions.length : null, positionSamples: positions.length, absent: eligible.length - appeared.length };
  });
  const totalWeighted = brandMetrics.reduce((sum, b) => sum + b.weighted, 0);
  const claims = eligible.flatMap((r) => r.payload.analysis!.claims);
  const domains = new Map<string, { count: number; urls: Set<string>; answerIds: Set<string>; sourceKinds: Set<string> }>();
  for (const r of eligible) for (const c of r.payload.citations) {
    const entry = domains.get(c.domain) || { count: 0, urls: new Set<string>(), answerIds: new Set<string>(), sourceKinds: new Set<string>() };
    entry.count++; entry.urls.add(c.url); entry.answerIds.add(r.id); entry.sourceKinds.add(c.source); domains.set(c.domain, entry);
  }
  const citationDomains = [...domains.entries()].map(([domain, v]) => ({ domain, count: v.count, urls: [...v.urls], answerIds: [...v.answerIds], sourceKinds: [...v.sourceKinds], target: hostMatches(domain, targetHost) })).sort((a, b) => b.count - a.count);
  const totalCitations = citationDomains.reduce((sum, d) => sum + d.count, 0);
  const scopes = [...new Set(eligible.map((r) => r.payload.provider + " / " + r.payload.model))];
  const scopeGroups = scopes.map((scope) => {
    const group = eligible.filter((r) => r.payload.provider + " / " + r.payload.model === scope);
    return { scope, count: group.length, mention: proportion(group.filter((r) => r.payload.analysis!.brands.some((b) => b.brandId === target?.id)).length, group.length) };
  });
  const stages = Object.keys(stageWeights).map((stage) => {
    const group = eligible.filter((r) => r.payload.question.stage === stage);
    return { stage, mention: proportion(group.filter((r) => r.payload.analysis!.brands.some((b) => b.brandId === target?.id)).length, group.length), answerIds: group.map((r) => r.id) };
  });
  return { eligible: eligible.length, excluded: rows.length - eligible.length, refusals: eligible.filter((r) => r.payload.analysis!.refused).length, answerIds: eligible.map((r) => r.id),
    brands: brandMetrics.map((b) => ({ ...b, share: totalWeighted ? b.weighted / totalWeighted : null, shareDenominator: totalWeighted })),
    target: brandMetrics.find((b) => b.kind === "target") || null,
    accuracy: proportion(claims.filter((c) => c.classification === "supported").length, claims.filter((c) => ["supported", "contradicted"].includes(c.classification)).length),
    unverifiedClaims: claims.filter((c) => c.classification === "unverifiable").length, timeSensitiveClaims: claims.filter((c) => c.classification === "time_sensitive").length,
    citationDomains, concentration: proportion(citationDomains.slice(0, 5).reduce((sum, d) => sum + d.count, 0), totalCitations), scopes, scopeGroups, stages, stageWeights,
    warning: "These results describe only the saved answers from the connected model or supplied imports. URL mentions are unverified citations, not evidence of browsing or training. Website agreement is not independent factual accuracy. Missing, truncated or unanalyzed answers are excluded; analyzed refusals remain in the denominator." };
}

