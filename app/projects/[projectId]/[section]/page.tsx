import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { CompanyProfile } from "@/components/company-profile";
import { QuestionsWorkspace } from "@/components/questions-workspace";
import { ResearchHome } from "@/components/research-home";
import { InsightsWorkspace } from "@/components/insights-workspace"; export default async function SectionPage({ params }: { params: Promise<{ projectId: string; section: string }> }) {
  const { projectId, section } = await params;
  if (["visibility", "competitors", "citations", "content", "recommendations", "reports"].includes(section)) return <InsightsWorkspace projectId={projectId} section={section as "visibility" | "competitors" | "citations" | "content" | "recommendations" | "reports"} />; if (section === "profile") return <CompanyProfile projectId={projectId} />;
  if (section === "questions") return <QuestionsWorkspace projectId={projectId} />;
  if (section === "website") return <ResearchHome projectId={projectId} websiteOnly />;
  if (section === "evidence") return <Workspace projectId={projectId} view="website" />;
  if (section !== "settings") notFound();
  return <Workspace projectId={projectId} view="settings" />;
}
