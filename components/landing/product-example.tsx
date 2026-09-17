"use client";

import { useState } from "react";
import { Aperture, ArrowDownRight, Check, ChevronRight, FileText, Globe2, Layers3, LayoutDashboard, Search, Settings2 } from "lucide-react";
import styles from "./landing.module.css";
import finish from "./iridescent.module.css";

// Deliberately isolated from the real inventory. These are illustrative fixtures,
// never persisted, counted as live observations, or passed to the crawler.
const examplePages = [
  {
    path: "/product", title: "One inbox. A shared understanding.", type: "Product",
    description: "A shared inbox for customer support teams.",
    text: "Northstar brings customer conversations into one shared inbox. Assign a conversation, leave context for your teammates, and keep the next reply moving. Built for support teams that work together.",
    headings: ["One inbox. A shared understanding.", "Every conversation in context", "Built for your team"],
  },
  {
    path: "/integrations/slack", title: "Keep your team in the conversation.", type: "Integration",
    description: "Connect support conversations with your team's Slack workspace.",
    text: "Connect Northstar to Slack to share conversation updates with your team. Choose a channel for notifications and follow a link back to the original customer conversation. Workspace administrators manage the connection.",
    headings: ["Keep your team in the conversation.", "Connect your workspace", "Choose your notifications"],
  },
  {
    path: "/security", title: "Your conversations deserve care.", type: "Security",
    description: "Learn about workspace access and account controls.",
    text: "Control who has access to your Northstar workspace. Administrators can invite teammates, manage roles, and remove access when someone leaves. Review the account settings to keep your team permissions current.",
    headings: ["Your conversations deserve care.", "Manage workspace access", "Review team permissions"],
  },
];
const evidenceViews = ["Content", "Headings", "Metadata"] as const;

export function ProductExample() {
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<(typeof evidenceViews)[number]>("Content");
  const page = examplePages[selected];

  return <figure className={styles.productFigure} id="product">
    <div className={`${finish.frame} ${finish.blue}`}>
      <div className={`${styles.productWindow} ${finish.surface}`}>
        <aside className={styles.exampleSidebar} aria-hidden="true">
          <div className={styles.exampleLogo}><Aperture size={21} strokeWidth={1.4} /><span>AnswerLens.</span></div>
          <div className={styles.exampleProject}><span>N</span><div>Northstar<small>Example project</small></div></div>
          <div className={styles.exampleNav}><LayoutDashboard size={15} />Overview</div>
          <div className={`${styles.exampleNav} ${styles.exampleNavActive}`}><Globe2 size={15} />Website</div>
          <div className={styles.exampleNav}><Layers3 size={15} />Competitors</div>
          <div className={styles.exampleSidebarBottom}><Settings2 size={14} />Project settings</div>
        </aside>
        <div className={styles.exampleMain}>
          <div className={styles.exampleTopbar}><span>Workspace <span>/</span> Northstar</span><span className={styles.exampleLabel}>Illustrative example</span></div>
          <div className={styles.exampleHeading}><div><span className={styles.exampleEyebrow}>Website inventory</span><h2>Every page. In perspective.</h2><p>northstar.example</p></div><span className={styles.exampleCount}>03<span>example pages</span></span></div>
          <div className={styles.exampleColumns}>
            <div className={styles.exampleInventory}>
              <div className={styles.exampleTableHeading}><span><Globe2 size={14} />Public pages</span><span>3 pages</span></div>
              <div className={styles.examplePageList} aria-label="Select an example page">
                {examplePages.map((item, index) => <button key={item.path} className={`${styles.examplePage} ${selected === index ? styles.examplePageActive : ""}`} aria-pressed={selected === index} onClick={() => setSelected(index)}>
                  <span className={styles.exampleFile}><FileText size={17} strokeWidth={1.4} /></span>
                  <span className={styles.examplePageName}><strong>{item.type}</strong><small>{item.path}</small></span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>)}
              </div>
              <div className={styles.exampleHint}><ArrowDownRight size={20} strokeWidth={1.25} /><p>Select a page.<br />Follow the evidence.</p></div>
              <div className={styles.exampleCollectionNote}><Check size={13} /><span>Source content stays inspectable.</span></div>
            </div>
            <section className={styles.exampleEvidence} aria-label="Selected example evidence">
              <div className={styles.exampleEvidenceHeader}><span><Search size={14} />Page evidence</span><span>HTML source</span></div>
              <h3>{page.title}</h3><p className={styles.exampleEvidenceUrl}>northstar.example{page.path}</p>
              <div className={styles.exampleTabs} aria-label="Choose evidence view">{evidenceViews.map((item) => <button key={item} className={view === item ? styles.exampleTabActive : ""} aria-pressed={view === item} onClick={() => setView(item)}>{item}</button>)}</div>
              <div className={styles.exampleExcerpt} aria-live="polite" aria-atomic="true">
                {view === "Content" && <><span className={styles.exampleEyebrow}>Extracted text</span><p>{page.text}</p><span className={styles.exampleSource}><FileText size={12} />Source: {page.path}</span></>}
                {view === "Headings" && <ol className={styles.exampleHeadings}>{page.headings.map((heading, index) => <li key={heading}><span>H{index === 0 ? 1 : 2}</span>{heading}</li>)}</ol>}
                {view === "Metadata" && <dl className={styles.exampleMetadata}><div><dt>Page title</dt><dd>{page.title}</dd></div><div><dt>Description</dt><dd>{page.description}</dd></div><div><dt>Source</dt><dd>northstar.example{page.path}</dd></div></dl>}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
    <figcaption><span>Meet your evidence workspace.</span> Interactive example with fictional content. Select a page to explore.</figcaption>
  </figure>;
}
