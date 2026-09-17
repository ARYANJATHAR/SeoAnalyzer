"use client";
import type { AuditIssue } from "@/db/schema";
import { dateLabel } from "@/lib/client";

export function AuditIssueDetail({ issue }: { issue: AuditIssue }) {
  return <article className="audit-issue-detail">
    <div className="audit-issue-meta"><span className={`badge severity-${issue.severity}`}>{issue.severity}</span><span>{issue.category}</span><code>{issue.ruleId}</code></div>
    <h3>{issue.title}</h3><p>{issue.explanation}</p>
    <h4>Suggested fix / review</h4><p>{issue.fix}</p>
    <h4>Recorded evidence</h4><dl className="audit-evidence">{issue.evidence.map((evidence, index) => <div key={index}>
      <dt>{evidence.label}</dt><dd>{Array.isArray(evidence.value) ? evidence.value.length ? <ul>{evidence.value.map((value, i) => <li key={i}>{value}</li>)}</ul> : "None captured" : String(evidence.value)}</dd>
      <dd><a href={evidence.sourceUrl} target="_blank" rel="noreferrer" className="mono">{evidence.sourceUrl}</a></dd>
      {evidence.observedAt && <dd className="helper-note">Observed {dateLabel(evidence.observedAt)}</dd>}
    </div>)}</dl>
    <p className="helper-note">Links open the live website. The values above are preserved from the crawl snapshot.</p>
  </article>;
}
