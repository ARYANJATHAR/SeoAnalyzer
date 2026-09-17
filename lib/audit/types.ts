export type Severity = "error" | "warning" | "observation";
export type PageKind = "home" | "product" | "editorial" | "faq" | "legal" | "other";
export type TechnicalSignals = {
  version: 1;
  pageKind: PageKind;
  canonicalCandidates: { raw: string; url: string | null }[];
  authors: string[];
  publishedDates: string[];
  modifiedDates: string[];
  contactSignals: string[];
  identitySignals: string[];
  scriptCount: number;
  javascriptNotice: string | null;
  mainText: string;
};
export type SiteSignals = {
  version: 1;
  robots: { origin: string; url: string; status: number; text: string; observedAt: string }[];
  llms: { url: string; finalUrl?: string; status: number | null; contentType?: string; text: string; truncated: boolean; error?: string; observedAt: string } | null;
};
export type Evidence = { label: string; value: string | number | string[]; sourceUrl: string; pageId?: string; observedAt?: string };
export type Finding = {
  ruleId: string; severity: Severity; category: string; title: string;
  explanation: string; fix: string; pageId: string | null; url: string; evidence: Evidence[];
};
export type RuleCoverage = {
  ruleId: string; title: string; category: string; severity: Severity;
  evaluated: number; passed: number; findings: number; notApplicable: number; unavailable: number;
};
export type AuditOutput = { findings: Finding[]; coverage: RuleCoverage[]; warnings: string[]; pagesAnalyzed: number };
