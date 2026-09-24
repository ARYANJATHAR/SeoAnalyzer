// User-facing language shared by the summary and result screens.
export function analysisStep(stage?: string) {
  if (stage === "visibility") return { index: 1, title: "Checking what AI says", detail: "We are asking buyer questions and saving the answers." };
  if (stage === "content") return { index: 2, title: "Choosing useful next steps", detail: "We are comparing the evidence and preparing your action plan." };
  const detail = stage === "questions" ? "We are preparing questions your buyers might ask." : stage === "competitors" ? "We are reading the competitor websites you added." : stage === "profile" ? "We are organizing what your website says about your business." : "We are collecting public pages and checking for website issues.";
  return { index: 0, title: "Understanding your website", detail };
}
export function resultStatus(status: string) {
  return ({ pending: "Waiting", queued: "Waiting", running: "In progress", answered: "Answer saved", completed: "Ready", partial: "Partly finished", failed: "Needs another try", cancelled: "Stopped" } as Record<string, string>)[status] || "Saved";
}
