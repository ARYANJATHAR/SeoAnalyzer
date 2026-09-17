"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main" className="standalone"><h1>Something interrupted this page.</h1><p>Your saved projects and collected pages remain in the local database.</p><div className="actions"><button className="button primary" onClick={reset}>Try again</button><Link className="button secondary" href="/projects">Projects</Link></div></main>;
}
