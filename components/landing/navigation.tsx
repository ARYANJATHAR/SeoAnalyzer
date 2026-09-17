"use client";

import Link from "next/link";
import { useState } from "react";
import { Aperture, ArrowUpRight, Menu, X } from "lucide-react";
import styles from "./landing.module.css";

const links = [
  { href: "#product", label: "The product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#approach", label: "Our approach" },
];

export function LandingNavigation() {
  const [open, setOpen] = useState(false);

  return <header className={styles.header}>
    <div className={styles.navbar}>
      <Link href="/" className={styles.logo} aria-label="AnswerLens home">
        <Aperture size={29} strokeWidth={1.5} aria-hidden="true" />
        <span>AnswerLens.</span>
      </Link>
      <nav className={styles.desktopNav} aria-label="Product navigation">
        {links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className={styles.navActions}>
        <Link className={styles.navWorkspace} href="/projects">Your workspace <ArrowUpRight size={14} aria-hidden="true" /></Link>
        <Link className={`${styles.cta} ${styles.dark} ${styles.navCta}`} href="/onboarding">Get started <ArrowUpRight size={15} aria-hidden="true" /></Link>
        <button className={styles.menuToggle} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="landing-mobile-nav" onClick={() => setOpen(!open)}>
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
    </div>
    {open && <nav id="landing-mobile-nav" className={styles.mobileNav} aria-label="Mobile product navigation">
      {links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
      <Link href="/projects" onClick={() => setOpen(false)}>Your workspace <ArrowUpRight size={15} aria-hidden="true" /></Link>
    </nav>}
  </header>;
}
