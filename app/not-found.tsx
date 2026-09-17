import Link from "next/link";
export default function NotFound() {
  return <main id="main" className="standalone"><p className="eyebrow">AnswerLens</p><h1>Page not found.</h1><p>This page may have moved, or the address is incomplete.</p><Link href="/projects" className="button primary">Back to projects</Link></main>;
}
