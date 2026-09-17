import { Workspace } from "@/components/workspace";
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  return <Workspace projectId={(await params).projectId} view="overview" />;
}
