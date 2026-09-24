"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Aperture, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./capability-cards.module.css";
import finish from "./iridescent.module.css";

const cards = [
  {
    title: "Your company, with competitive context",
    description: "Bring up to three competitor websites into the same project. Explore their public pages alongside your own, with the source always in view.",
    link: "Set up your research", href: "/onboarding", value: "3", unit: "competitors", label: "Company research", tone: "blue",
  },
  {
    title: "A crawl that fits your research",
    description: "Choose a limit of 25, 50, 100, or 250 page attempts per website. Set your boundaries before collecting, including the paths to leave out.",
    link: "Choose your crawl scope", href: "/onboarding", value: "250", unit: "max. page attempts", label: "Website discovery", tone: "teal",
  },
  {
    title: "From website pages to company understanding",
    description: "Organize products, features, customers and pricing from saved website content. Each detail includes a source quote, with no approval steps to work through.",
    link: "Create a company profile", href: "/projects", value: "0", unit: "approval steps", label: "Company profile", tone: "rose",
  },
  {
    title: "Give your research a place to live",
    description: "Keep your projects, collected pages, and crawl history in one workspace on your computer. Return to earlier collections whenever you need the context.",
    link: "Open your workspace", href: "/projects", value: "1", unit: "local workspace", label: "Research history", tone: "stone",
  },
];

export function CapabilityCards() {
  const track = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ start: true, end: false, first: 1, last: 2 });

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      const visible = Array.from(element.children).flatMap((child, index) => {
        const card = child.getBoundingClientRect();
        const overlap = Math.min(bounds.right, card.right) - Math.max(bounds.left, card.left);
        return overlap > card.width / 2 ? [index + 1] : [];
      });
      setPosition({ start: element.scrollLeft < 4, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4,
        first: visible[0] || 1, last: visible.at(-1) || 1 });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, []);

  function move(direction: number) {
    const element = track.current;
    const first = element?.firstElementChild;
    if (!element || !first) return;
    const step = first.getBoundingClientRect().width + parseFloat(getComputedStyle(element).columnGap || "0");
    const visibleCount = Math.max(1, Math.round(element.clientWidth / step));
    const current = Math.round(element.scrollLeft / step);
    element.scrollTo({ left: Math.max(0, (current + direction * visibleCount) * step),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  return <section className={styles.section} aria-labelledby="capabilities-heading" aria-roledescription="carousel">
    <div className={styles.heading}><h2 id="capabilities-heading">More context.<br /><span>A clearer starting point.</span></h2><p>What you can bring into focus with AnswerLens today.</p></div>
    <div className={styles.track} id="capability-card-track" ref={track} tabIndex={0} aria-label="AnswerLens capabilities; scroll to explore all four cards" onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
    }}>
      {cards.map((card, index) => <article key={card.title} className={`${styles.frame} ${finish.frame} ${finish[card.tone]}`} aria-roledescription="slide" aria-label={`${index + 1} of ${cards.length}: ${card.title}`}>
        <div className={`${styles.card} ${finish.surface}`}>
          <div className={styles.copy}><h3>{card.title}</h3><p>{card.description}</p><Link href={card.href} className={styles.link}>{card.link}<ArrowUpRight size={14} aria-hidden="true" /></Link></div>
          <div className={styles.bottom}><div className={styles.figure}><span>{card.value}</span><small>{card.unit}</small></div><div className={styles.signature}><Aperture size={25} strokeWidth={1.4} aria-hidden="true" /><div>AnswerLens<small>{card.label}</small></div></div></div>
        </div>
      </article>)}
    </div>
    <div className={styles.controls}><div className={styles.buttons}><button type="button" aria-label="Previous capability cards" aria-controls="capability-card-track" disabled={position.start} onClick={() => move(-1)}><ChevronLeft size={22} aria-hidden="true" /></button><button type="button" aria-label="Next capability cards" aria-controls="capability-card-track" disabled={position.end} onClick={() => move(1)}><ChevronRight size={22} aria-hidden="true" /></button></div><p aria-live="polite" aria-atomic="true">{position.first === position.last ? position.first : `${position.first}–${position.last}`} / {cards.length}</p><span className={styles.disclosure}>Product capabilities, not measured customer outcomes.</span></div>
  </section>;
}
