import { ResearchHome } from "@/components/research-home";
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  return <ResearchHome projectId={(await params).projectId} />;
}
