import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { CompanyProfile } from "@/components/company-profile";
export default async function SectionPage({ params }: { params: Promise<{ projectId: string; section: string }> }) {
  const { projectId, section } = await params;
  if (section === "profile") return <CompanyProfile projectId={projectId} />;
  if (section !== "website" && section !== "settings") notFound();
  return <Workspace projectId={projectId} view={section} />;
}
