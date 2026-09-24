import type { Metadata } from "next";
import Link from "next/link";
import { Aperture, ArrowDown, ArrowRight, ArrowUpRight, Check, FileSearch, Globe2, History, Layers3, Plus, ShieldCheck } from "lucide-react";
import { LandingNavigation } from "@/components/landing/navigation";
import { ProductExample } from "@/components/landing/product-example";
import { CapabilityCards } from "@/components/landing/capability-cards";
import styles from "@/components/landing/landing.module.css";
import finish from "@/components/landing/iridescent.module.css";

import { DemoButton } from "@/components/demo-button"; export const metadata: Metadata = {
  title: "AnswerLens | AI visibility starts with evidence",
  description: "Explore your website and competitors, inspect page-level evidence, and build a stronger foundation for AI visibility research with AnswerLens.",
};

const features = [
  { icon: Globe2, title: "Know what your website says.", body: "Bring public pages into one inventory. Read the titles, headings, links, and content that describe your company.", detail: "From homepage to the details" },
  { icon: Layers3, title: "Put competitors in context.", body: "Collect up to three competitor websites alongside your own. Explore their pages with the same view of the underlying content.", detail: "A shared starting point for research" },
  { icon: FileSearch, title: "Go straight to the source.", body: "Open a page and inspect its content, metadata, and structured data. The evidence is always within reach.", detail: "Every page stays inspectable" },
  { icon: History, title: "Keep the earlier picture.", body: "Run another crawl when your website changes. Return to previous collections without losing the pages you already gathered.", detail: "History you can come back to" },
];
const steps = [
  { number: "01", title: "Give your research a home.", body: "Enter your website. Add company context and competitors only when you want to." },
  { number: "02", title: "Let the research run.", body: "We collect public pages, prepare buyer questions and check independent AI answers automatically." },
  { number: "03", title: "Look beneath the surface.", body: "Read a clear summary, explore the evidence and follow a practical 30-day and 90-day plan." },
];
const questions = [
  { question: "What can I use today?", answer: "Create projects, crawl your website and up to three competitors, and inspect technical audit findings. Turn saved pages into a sourced company profile, then generate suggested buyer types and questions. A starting question set is selected automatically, followed by AI answer checks, content insights and an action plan." },
  { question: "Does AnswerLens measure AI visibility yet?", answer: "Yes. It saves independent answers to buyer questions and measures brand mentions, recommendations and captured citation links within that sample. Evidence details disclose the actual model and sample size; results do not represent every AI system." },
  { question: "How do I create a company profile?", answer: "Start with your website. AnswerLens chooses useful pages and creates the company profile automatically. Each detail remains linked to a saved source." },
  { question: "Where does my research live?", answer: "Your projects and collected pages are stored on the computer running AnswerLens. Website requests are sent to the public sites you choose to crawl. The local application and crawl worker need to stay running while pages are collected." },
  { question: "Can it crawl every page on a website?", answer: "The crawler respects robots rules, exclusions, and your chosen page cap. It collects public server HTML, so content that appears only after JavaScript runs may be incomplete. Failed or skipped pages are shown in your inventory." },
];

export default function Home() {
  return <div className={styles.landing}>
    <LandingNavigation />
    <main id="main">
      <section className={`${styles.container} ${styles.hero}`} aria-labelledby="hero-heading">
        <p className={styles.heroIntro}>A clearer perspective on AI discoverability</p>
        <h1 id="hero-heading">Better AI visibility<br /><span>starts with evidence.</span></h1>
        <p className={styles.heroDescription}>Bring your website and competitors into focus. Inspect the content that tells your story, one source at a time.</p>
        <div className={styles.heroActions}><Link href="/onboarding" className={`${styles.cta} ${styles.dark}`}>Start your research <ArrowUpRight size={17} aria-hidden="true" /></Link><a href="#product" className={`${styles.cta} ${styles.stone}`}>Explore the product <ArrowDown size={16} aria-hidden="true" /></a></div>
        <div className={styles.heroActions}><DemoButton /></div><ProductExample />
      </section>

      <div className={`${styles.container} ${styles.audienceStrip}`}><p>Made for people asking<br /><strong>better questions about their brand.</strong></p><ul aria-label="Who AnswerLens is for"><li>Marketing teams</li><li>SEO & content leads</li><li>Founders</li><li>Consultants</li></ul></div>

      <section className={`${styles.container} ${styles.features}`} aria-labelledby="features-heading">
        <div className={styles.sectionTitle}><p className={styles.sectionLabel}>The foundation, in focus</p><h2 id="features-heading">Your website has a story.<br /><span>See the whole picture.</span></h2><p>Less time piecing together pages.<br />More room to understand what they actually say.</p></div>
        <div className={styles.featureGrid}>{features.map((feature, index) => {
          const Icon = feature.icon;
          const tone = ["blue", "teal", "rose", "stone"][index];
          return <article key={feature.title} className={`${styles.feature} ${finish.frame} ${finish[tone]}`}><div className={`${styles.featureInner} ${finish.surface}`}><span className={styles.featureIcon}><Icon size={25} strokeWidth={1.35} aria-hidden="true" /></span><h3>{feature.title}</h3><p>{feature.body}</p><span className={styles.featureDetail}>{feature.detail}</span></div></article>;
        })}</div>
      </section>

      <CapabilityCards />

      <section className={styles.workflowSection} id="how-it-works" aria-labelledby="workflow-heading"><div className={styles.container}>
        <div className={styles.workflowTitle}><h2 id="workflow-heading">From a website<br />to a working picture.</h2><Link href="/onboarding" className={`${styles.cta} ${styles.outline}`}>Create your first project <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        <ol className={styles.workflowSteps}>{steps.map((step) => <li key={step.number}><span className={styles.stepNumber}>{step.number}</span><h3>{step.title}</h3><p>{step.body}</p></li>)}</ol>
        <div className={styles.workflowNote}><ShieldCheck size={17} strokeWidth={1.4} aria-hidden="true" /><p>Public pages. Clear crawl boundaries. Your research, stored locally.</p></div>
      </div></section>

      <section className={`${styles.container} ${styles.approach}`} id="approach" aria-labelledby="approach-heading">
        <div className={styles.approachCopy}><p className={styles.sectionLabel}>A little more rigor</p><h2 id="approach-heading">Trust comes from<br />being able to look closer.</h2><p>A useful finding should lead somewhere: to a page, a passage, or an answer you can inspect. That’s the idea behind AnswerLens.</p><ul>{["Keep the original source in view.", "Separate observations from interpretations.", "Make the limits of the data clear."].map((principle) => <li key={principle}><Check size={16} aria-hidden="true" />{principle}</li>)}</ul></div>
        <div className={`${finish.frame} ${finish.teal}`}><div className={`${styles.researchPath} ${finish.surface}`} aria-label="Product development path"><div className={styles.researchPathHeader}><Aperture size={23} strokeWidth={1.3} aria-hidden="true" /><span>The evidence trail</span></div>
          <div className={`${styles.pathStep} ${styles.pathStepAvailable}`}><span className={styles.pathNode}><Globe2 size={18} aria-hidden="true" /></span><div><h3>Website evidence</h3><p>Pages, content, structure, and sources</p></div><span className={styles.availableLabel}><span />Available</span></div>
          <div className={`${styles.pathStep} ${styles.pathStepAvailable}`}><span className={styles.pathNode}><FileSearch size={18} aria-hidden="true" /></span><div><h3>Company understanding</h3><p>Company details with source evidence</p></div><span className={styles.availableLabel}><span />Available</span></div>
          <div className={styles.pathStep}><span className={styles.pathNode}><Layers3 size={18} aria-hidden="true" /></span><div><h3>AI visibility experiments</h3><p>Independent answers and scoped metrics</p></div><span className={styles.availableLabel}>Available</span></div>
          <div className={styles.pathStep}><span className={styles.pathNode}><ArrowUpRight size={18} aria-hidden="true" /></span><div><h3>Evidence-backed actions</h3><p>Priorities, improvements, and repeat research</p></div><span className={styles.availableLabel}>Available</span></div>
          <p className={styles.pathFootnote}>Building toward a complete AI visibility research workflow, one inspectable step at a time.</p>
        </div></div>
      </section>

      <section className={`${styles.container} ${styles.faq}`} id="questions" aria-labelledby="faq-heading"><div><p className={styles.sectionLabel}>A few things to know</p><h2 id="faq-heading">Good questions.<br />Clear answers.</h2><p>What’s here today,<br />and where we’re going next.</p></div><div className={styles.faqList}>{questions.map((item) => <details key={item.question}><summary>{item.question}<Plus size={18} strokeWidth={1.5} aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</div></section>

      <section className={`${styles.container} ${finish.frame} ${finish.rose}`} aria-labelledby="closing-heading"><div className={`${styles.closing} ${finish.surface}`}><Aperture size={44} strokeWidth={1.1} aria-hidden="true" /><h2 id="closing-heading">A clearer view<br />starts with your website.</h2><p>Give your next decision a source to stand on.</p><Link href="/onboarding" className={`${styles.cta} ${styles.dark}`}>Create your first project <ArrowUpRight size={17} aria-hidden="true" /></Link></div></section>
    </main>
    <footer className={styles.footer}><div className={`${styles.container} ${styles.footerMain}`}><div><Link href="/" className={styles.logo}><Aperture size={26} strokeWidth={1.5} aria-hidden="true" /><span>AnswerLens.</span></Link><p>A source-first perspective<br />on AI discoverability.</p></div><nav aria-label="Footer product navigation"><span>Explore</span><a href="#product">The product</a><a href="#how-it-works">How it works</a><a href="#approach">Our approach</a><a href="#questions">Questions & answers</a></nav><nav aria-label="Footer workspace navigation"><span>Your research</span><Link href="/projects">Open workspace <ArrowUpRight size={13} aria-hidden="true" /></Link><Link href="/onboarding">Create a project <ArrowRight size={13} aria-hidden="true" /></Link></nav></div><div className={`${styles.container} ${styles.footerBottom}`}><span>AnswerLens · Website research, with context.</span><span>Built around evidence. Open about limitations.</span></div></footer>
  </div>;
}
