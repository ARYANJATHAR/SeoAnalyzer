import type { Metadata } from "next";
import { ProjectList } from "@/components/project-list";

export const metadata: Metadata = { title: "Your projects" };

export default function ProjectsPage() {
  return <ProjectList />;
}
