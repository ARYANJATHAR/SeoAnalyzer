# AnswerLens

A local-first website research workspace for a B2B company's AI discoverability. The local plan.md is the functional specification; DESIGN supplies the primary visual theme. Markdown files other than this README intentionally stay out of Git.

## Complete workflow: Phases 1–9

**Code status:** Phases 1–9 and the simplified automatic workflow are implemented. The September 2026 UX update passed the production build, TypeScript check, lint and all 40 existing unit tests. Browser/UI testing, live AI requests and end-to-end workflow verification were not performed in this update.

### Simpler workspace

- **Home:** a three-step progress summary, saved AI results, suggested improvements and the main website findings.
- **AI results:** a plain-language result such as “Your brand appeared in 6 of 10 answers,” followed by the original answers in groups of five.
- **Action plan:** the first three suggested improvements, with instructions and evidence available on demand. The full 30-day/90-day plan remains expandable.
- **Report:** the printable report and optional data downloads.
- **Explore details:** website checks, content ideas, company details, buyer questions, competitors and sources. Advanced filters, refresh controls and calculations stay expandable.
- Setup needs only a website address; extra company context stays optional. The existing DESIGN theme remains in use.

### Checks completed for the UX update

| Check | Result |
| --- | --- |
| `npm run build` | Passed, including production TypeScript and page generation |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with no warnings |
| `npm run test:audit` | 16 passed |
| `npm run test:profile` | 8 passed |
| `npm run test:questions` | 6 passed |
| `npm run test:insights` | 10 passed |

These are code-level checks. No browser was opened, no UI automation was run, and no live AI analysis was started. Earlier phase checklists below describe manual verification still available to the owner.

### In easy words

Enter a website and choose **Analyze website**. AnswerLens reads public pages, checks website issues, creates a company profile, suggests buyer questions, reads configured competitor sites, checks independent AI answers, and prepares content improvements and a 30-day/90-day plan.

The overview stays short. Sources, technical findings, question customization and advanced sampling options are expandable. There is no human approval queue or user-facing key/endpoint configuration. Actual answer-source/model identifiers remain in measurement details so coverage is accurately disclosed.

**The AI allowance was not changed.** The existing default is **50 lifetime request attempts per project**, shared by all AI tasks, not a daily reset. Twenty questions normally need about 40 requests for answers and analysis, plus profiles, question generation and content analysis. Retries consume more. A complete workflow can therefore stop partially under the default budget. The owner can adjust `AI_REQUEST_BUDGET`, restart and resume unfinished work. Provider quotas remain authoritative; unlimited free access is not promised.

### Restart after updating

- Preserve the existing database and `.env.local`. No dependency was added for phases 5–9.
- `npm run dev` starts **five processes**: web, crawler, profile, questions/orchestration and insights.
- `npm run worker:insights` starts the new worker separately.
- Migrations `0006_guided_analysis.sql`, `0007_visibility_and_insights.sql` and `0008_complete_analysis_flow.sql` apply automatically on the next app/database start. They have not been executed by the coding agent.
- All processes need the same working directory and database path. Closing the browser does not stop work; stopping local workers does.
- Current project location: `D:\PROJECTS\Personal projecs\websites\SEO ANALYER`. The saved Codex workspace path points to the old location.

### Remaining phase deliverables

| Phase | Implemented code |
| --- | --- |
| 5 | Durable experiments; 1/3/5 answer samples; isolated answering; raw prompts/answers/citations/model/time/usage capture; structured mentions, recommendations, sentiment, refusals and claim comparison; cancellation/resume; one-answer and multiline quoted CSV import. |
| 6 | Mention/recommendation/citation/website-agreement rates; weighted share; sample counts and Wilson intervals; buyer-stage and competitor views; citation domains/top-five concentration; date/persona/stage/type/question/source filters; history and comparable-setup lookup. |
| 7 | Semantic page inventory; quoted question matches; eight readiness components with 60 rule-based and 40 AI points; explicit missing components; separate site averages; competitor coverage matrix; content/evidence gaps. |
| 8 | Evidence-linked prioritized actions with owner, effort, expected result and acceptance criteria; first-30-day and 90-day plans; printable HTML/browser PDF; five CSV datasets and JSON research backup. |
| 9 | Idempotent fictional demo without keys; two saved answer cycles and content fixtures; visible synthetic labels; four-step tour; responsive and keyboard-friendly controls; loading/empty/error/progress states; portfolio case study and demo script below. |

### Evidence, limits and recovery

- Live answering receives only the buyer question and geographic context. No target profile, website facts or previous conversation is injected. A separate analysis call receives the saved answer and frozen source facts.
- Source facts remain website claims, not human-confirmed truth. Structured output, quote occurrence and reference IDs are validated; semantic judgments can still be wrong.
- Fresh monitoring creates new answers. Resume preserves completed answers and retries analysis against already-saved text. Truncated live answers are retried and excluded from metrics until complete.
- Database claims, heartbeats and ownership checks protect workers. After a three-minute interruption, unfinished work becomes partial and can be resumed. A remote request may already have consumed quota before interruption; exact-once remote billing is not guaranteed.
- Stop prevents subsequent stages being queued and aborts active requests when workers observe cancellation. Public discovery already in progress may finish, but cannot queue its result into a stopped flow.
- Imports retain raw text, supplied tool/model, observation date and notes. They remain separate from live experiments. Unmatched imported questions receive generic research-stage/type/intent metadata and are not added to the editable question library automatically.
- Metrics include completed, analyzed, nontruncated answers; analyzed refusals stay in the denominator. Failed, missing, truncated and unanalyzed rows are disclosed and excluded.
- Citation rate divides target-linked answers by answers with any captured URL. Provider annotations, text links and manual links retain provenance. The analyzer never fetches these URLs; a link is not proof of browsing, validity or influence.
- Share weights: discovery/education 1; research/risk review 2; comparison/purchase 3. Recommendation position excludes absent brands and answers without explicit recommendation lists.
- Agreement excludes unverifiable/time-sensitive claims. Conflicting website facts prevent a supported/contradicted conclusion.
- Readiness is an internal diagnostic, not an AI ranking factor. Missing dates/components stay unknown; partial points are never normalized to 100.
- Content uses up to 12 readable pages per website, homepage first then URL order, with at most 12,000 saved text characters per page. A missing match refers to these excerpts, not the whole website.
- Site scores average analyzed pages and disclose evaluated weight. Gap/action URLs point to recorded evidence; recommendation outcomes are not guaranteed.
- Reports escape HTML; CSV neutralizes formula-leading cells; JSON excludes secrets, owner configuration and the request ledger. Automatic JSON restore is not implemented.
- Updates preserve edited questions and historical results. Recrawls create fresh bounded snapshots; conditional HTTP revalidation is not implemented.

### Owner checks: automatic workflow

These are instructions to run, not completed checks.

- [ ] Back up local data with all five processes stopped. Restart and confirm old projects, pages, facts and questions remain.
- [ ] Create a project using only a website. Watch the stages through to answer results and content plans.
- [ ] Close/reopen the browser. Stop at different stages; no later work should be queued after stop.
- [ ] Inspect the short overview and expandable technical/profile/question details.
- [ ] Add competitor websites and rerun. Inspect comparable evidence; failures must mark coverage incomplete without inventing results.
- [ ] Try missing keys, unavailable models and exhausted allowance. Saved work must remain available with plain failure/partial messages.
- [ ] Change the target website after stopping work. Old target completion must not become completion for the new target.
- [ ] Update a website after editing questions; preserve edits and selection while producing fresh answer samples.

### Owner checks: Phase 5

- [ ] When ready, run `npm run typecheck`, `npm run lint`, `npm run test:insights`, the existing audit/profile/questions suites and `npm run build`. The new test source covers denominators, alias boundaries, URL safety, CSV parsing/formula protection and Wilson intervals. It does not establish live integration correctness.
- [ ] Run 20 selected questions with 1/3/5 samples within the configured allowance: expect 20/60/100 planned answers.
- [ ] Inspect exact answering prompts: no company profile/source facts; only the question and geography.
- [ ] Inspect saved text, timestamps, actual source/model, mention order, recommendations, sentiment, reasons, limitations, refusal and claim evidence.
- [ ] Exercise refusal, truncation, timeout and invalid structured output. They must not silently become successful zero-performance results.
- [ ] Stop and resume; completed answers must stay unchanged and analysis retries must reuse saved raw text.
- [ ] Interrupt the insights worker, restart after three minutes and resume. Lost workers must not overwrite current ownership.
- [ ] Exercise both endpoint backup directions using owner configuration; retain actual served-model/source groups.
- [ ] Import one answer and CSV with BOM, quoted commas, embedded newlines and escaped quotes. Preserve raw content and manual labels.
- [ ] Reject malformed quoting, invalid/duplicate headers, invalid/future dates and unsafe citation URLs.
- [ ] Exhaust allowance, raise it as owner, restart and resume. Use the updated allowance without rewriting previous answers or their generation settings.
- [ ] Try another project's run/answer IDs through a different project route; reject cross-project access.

### Owner checks: Phase 6

- [ ] Count mentions/recommendations by hand and compare numerators, denominators and answer evidence.
- [ ] Verify eligibility for refused, failed, unanalyzed and truncated answers.
- [ ] Zero eligible answers must produce unavailable metrics; no links must produce an unavailable citation rate.
- [ ] Check a legitimate target subdomain and a misleading suffix such as `target.example.evil.example`.
- [ ] Recalculate weighted share, recommendation-list-only position and absence counts.
- [ ] Verify source agreement excludes unknown/time-sensitive claims and leaves conflicts unresolved.
- [ ] Filter date, persona, stage, type, question text and answer source; counts and supporting answers must change together.
- [ ] Inspect history/comparable setup. Different questions, sample counts, generation settings or tracked brands must not be called identical.
- [ ] Inspect actual served-model groups after failover. Small samples should be directional; Wilson intervals must disclose their limits.

### Owner checks: Phase 7

- [ ] Inspect all components of target and competitor page scores. Rule components total 60 possible points, AI components 40.
- [ ] Missing dates must stay unknown. Stop/exhaust allowance mid-job: keep available rule checks and explicit partial denominators.
- [ ] Inspect quoted question matches, products, topic, page type, buyer stage, collection time/hash and identical-text links.
- [ ] Inspect the coverage matrix for covered and uncovered questions. Site averages must name analyzed page counts and available weight.
- [ ] Inspect gap URLs and exact target/competitor passages. No-match findings must name the target sample and excerpt limits.
- [ ] Review performance-claim evidence gaps and differing-company-detail actions; missing support in an excerpt must not be called a false claim.
- [ ] Resume a partial job without regenerating completed page analysis.

### Owner checks: Phase 8

- [ ] Each action has reason, evidence, relevant URLs/questions, owner, effort, confidence, expected result and acceptance criteria.
- [ ] Recalculate priorities: commercial impact 35%, visibility gap 25%, confidence 15%, relevance 15%, ease 10%.
- [ ] Inspect 30-day/90-day grouping and repeat date; no guaranteed visibility/citation outcomes.
- [ ] Open the report and print to PDF. Inspect all sections, page breaks, long URLs and coverage disclosures.
- [ ] Download all five CSV types and JSON; inspect multiline answers, snapshots, demo flags, no credentials/configuration and formula protection.
- [ ] Put HTML tags/formula prefixes in imported/custom text; they must remain inert in UI, reports and spreadsheets.
- [ ] Exports must not initiate AI requests.

### Owner checks: Phase 9

- [ ] With no keys, open **Explore the demo** from Landing/Projects. Reopen it: only one fictional project should exist.
- [ ] Visit demo screens, answers and reports; synthetic labels must stay visible and no live crawl/AI call should run.
- [ ] Follow all four tour steps and inspect both fixture cycles and the content plan.
- [ ] Try narrow screens and keyboard-only navigation, visible focus, native disclosures, filters, pagination, empty/error/retry states.
- [ ] Confirm live projects do not inherit demo records and still enforce public-URL protections.
- [ ] Follow the demo script below and record usability/accessibility findings.

Record passed, failed or untested items with reproduction steps and sanitized errors. All new acceptance criteria remain unverified until the owner checks them.

### Portfolio case study

**Problem:** Marketing teams need to connect AI answer observations with company facts, competitor coverage and practical improvements.

**Method:** Collect public HTML, preserve source passages, generate buyer research, sample independent answers, compare them with frozen website claims and turn findings into evidence-linked actions. Deterministic observations and AI judgments remain distinct.

**Implementation result:** The code connects website collection to saved answer evidence, scoped metrics, content gaps, plans and exports. This is an implementation statement, not a claim of tested correctness, deployment success, adoption or improved brand visibility.

**Tradeoffs:** Local SQLite/workers simplify operation but must stay running. Public HTML can miss JavaScript content. Bounded samples reduce usage and coverage. NVIDIA/OpenRouter backup may share upstream infrastructure. Website claims are an imperfect factual reference.

**Evaluation limits:** Real model behavior, resilience, migration safety, accessibility and print quality await owner verification. Demo values are fictional and must not be marketed as achieved outcomes. Repeated answers are not independent market samples, and observed changes do not establish causation.

### Three-minute demo script

- **0:00–0:30:** Open the labeled demo; explain the live website-only starting point.
- **0:30–1:10:** Show Visibility, the sample count and one exact saved question/answer with claim evidence.
- **1:10–1:45:** Show competitor comparison and a content gap; open page passages and explain sample limits.
- **1:45–2:20:** Show the top actions, one acceptance checklist and the 30-day/90-day plan.
- **2:20–3:00:** Open the printable report and exports; distinguish the fictional example from real measurements and explain limitations.

## Earlier phase implementation notes

The following notes preserve earlier implementation guidance. Their manual tools now live in expandable details; the automatic workflow above is the default.


Website collection (Phase 1):

- Next.js application shell and responsive cream/stone/graphite interface.
- Project creation and editing, company details, aliases, product names, market, and conversion goal.
- Up to three competitor websites, normalized duplicate detection, and history-preserving updates.
- Crawl caps of 25, 50, 100, or 250 page attempts per website; excluded path prefixes.
- Robots and sitemap preview before an explicit crawl start. Sitemap indexes are supported.
- SQLite storage, versioned SQL migration, and Drizzle data access.
- Persistent crawl queue, separate local worker, progress polling, cancellation, and stale-worker recovery.
- Bounded public-site crawling with DNS validation pinned to the connection, redirect validation, robots permissions, host throttling, response limits, and timeouts.
- Page inventory with website/status/search/history filters and pagination.
- Accessible page evidence drawer: title, description, headings, extracted text, links, JSON-LD, canonical, language, robots directives, hashes, status, and recorded redirect chains, including failed redirects.

The repository originally contained only the specification and design folder. The minimum Phase 0 app/database foundation is included so Phase 1 has a runnable structure. The complete seeded demonstration is described above.

**Historical Phase 4 verification status:** The owner confirmed Phase 1 crawling works and authorized implementation through Phase 9. Phases 2–4 are written; verification remains with the owner. The coding agent has not run tests, type checks, lint, builds, migrations, application previews, or authenticated AI requests for Phase 4.

### Technical audit (Phase 2)

- Versioned deterministic rule registry covering the technical checks in section 7.3 of `plan.md`.
- Persisted audit snapshots and issues with rule ID, error/warning/observation severity, source URLs, recorded evidence, explanation, and suggested fix or review.
- Automatic audit when a crawl completes, fails, or is cancelled normally. An audit failure leaves collected pages intact and exposes a manual retry.
- “Audit saved pages” for terminal Phase 1 or interrupted-worker crawls, without making new network requests.
- Overview and Website audit section: severity counts, website/crawl scope, severity/category/rule/search filters, server-side issue pagination, and expandable evidence.
- Audit tab in the page evidence drawer and per-rule coverage showing findings, no finding, unavailable, and inapplicable checks separately.
- New crawl signals: canonical candidates, editorial metadata, contact/identity indicators, per-origin robots snapshots, and an optional bounded `llms.txt` request.
- Critical-rule test source in `tests/audit/engine.test.ts`, ready for the owner to execute.

Restart the local web application and worker to pick up the new code and automatic `0003_technical_audit.sql` migration. Existing pages remain available. Open Overview or Website and choose **Audit saved pages** for an earlier crawl; start a **new crawl** to collect the additional Phase 2 signals. An old snapshot's missing evidence remains unavailable, never inferred from today's website.

See [audit methodology](docs/audit-methodology.md) for thresholds, evidence scope, and known limitations. No composite SEO or AI visibility score is invented.

### Company profile (Phase 3)

**In plain language:** Phase 1 collects website pages. Phase 2 finds technical issues. Phase 3 reads the saved page text and turns it into an organized company profile.

The output includes company descriptions, products, features, target customers, use cases, integrations, pricing and other claims that the selected pages support. Every detail includes a source quote, URL and collection time. Missing information is left out. Differing claims are shown together without inventing a winner. This is website understanding, not an AI visibility score or proof that the claims are true.

The user flow is **choose saved pages → Create company profile → read the results**. Results appear automatically as pages finish. Search, topic filters, source inspection, progress, stopping work and saved-result reuse remain available. There is no human-review queue, accept/reject step, manual fact form or provider configuration in the product.

The user's latest instruction supersedes the original human-review requirement in `plan.md`. Existing review records are preserved; previously rejected facts remain excluded. New extracted facts are not relabeled human-confirmed.

#### Server owner setup

1. Add `NVIDIA_API_KEY` and `OPENROUTER_API_KEY` to the existing `.env.local`. These are still required for the backend to call the services; end users never enter keys or choose providers.
2. Restart with `npm run dev`. The command starts the web app and the crawl, profile, question and insights workers; pending migrations apply automatically. Preserve the existing database.
3. Open **Company profile**, select a saved crawl and pages, then **Create company profile**.

Defaults are NVIDIA primary, OpenRouter backup, Nemotron 3 Super, a 50-request lifetime budget per project, and up to six pages per extraction. Owner-only overrides in `.env.local`: `AI_PRIMARY_PROVIDER`, `AI_FALLBACK_ENABLED`, `AI_MODEL`, `AI_REQUEST_BUDGET`, `AI_PAGE_LIMIT`, `AI_MAX_TOKENS`, `AI_TEMPERATURE`, `AI_TIMEOUT_SECONDS`. See `.env.example`. Explicit environment values override saved settings. Restart after changes; start a new job after raising an exhausted budget.

There are six curated shared model mappings, live availability checks, free-only OpenRouter routing, bounded retries, schema and quote validation, cancellation, caching and a local usage ledger. Provider settings and diagnostics are backend concerns, absent from the profile UI and its normal data responses. Legacy localhost-only administration endpoints remain available for owner diagnostics; they are not a hosted administration boundary.

Research on September 17, 2026 found 24 OpenRouter entries with zero prompt/completion prices and 82 NVIDIA catalog entries, including specialized models. NVIDIA's count is not proof of unrestricted free access. The default OpenRouter route shares NVIDIA upstream, so backup cannot guarantee recovery from a shared outage. See [provider research](docs/ai-providers.md).

Only selected public page text, URLs and collection times are sent for extraction. Project notes and existing profile facts are not sent. Exact source quotes and structured output are checked before saving results. The backend retains detailed usage and error records without showing service configuration to users.

### Buyer types and question library (Phase 4)

**In plain language:** Phase 3 explains what the company does. Phase 4 suggests who might buy it and what they might ask before choosing a product.

Open **Questions** after creating a company profile, then choose **Generate buyer research**. The output includes:

- Two to four suggested buyer types, with role, company type, main problem, purchase criteria, objections, technical familiarity and commercial importance. These are hypotheses, not verified customer segments.
- A baseline of 30 distinct questions, tagged by buyer type, journey stage, question type, geography, buying intent (1–5), potentially relevant brands and information needed for an accurate answer.
- Both branded and non-branded questions, with informational and commercial intent. Missing information is listed as an answer need rather than invented as a product fact.
- Up to 20 recommended selections, favoring commercial intent while covering available stages, buyer types and branded/non-branded wording. The first successful generation selects these if no selection exists. You can select fewer, replace the picks or clear them.
- Optional editing, custom buyer types/questions, archiving/restoring, search, filters, pagination and source evidence. There is no approval queue or provider configuration in the product.
- A **future-run estimate** for one, three or five answers per selected question. This does not create an experiment, send questions for answers or reserve allowance. Execution is now available in Visibility; this legacy estimate does not start a run.

#### Phase 4 setup and behavior

1. Keep existing server keys and database. Restart `npm run dev`; migration `0005_buyer_questions.sql` applies automatically.
2. The command now runs five processes: web, crawler, company-profile worker, buyer-question worker and insights worker. A standalone question worker can be started with `npm run worker:questions` if you run processes separately.
3. Open your project's **Questions** page. Generation uses project description, audience, market, configured brands and up to 40 recent distinct, non-rejected target-company facts. Fact values sent are capped at 600 characters; their source evidence is retained in the generation snapshot. This is contextual question generation, not an unaided visibility experiment.
4. Existing personas/questions are preserved. Generation fills toward the baseline; reaching 30 does not silently replace edits or archived questions. If missing intent/brand coverage needs filling, a small number of extra questions may be added.

Normal generation uses one persona call and six five-question batches. Output validation permits one repair per generation call. Up to ten question batches are attempted to fill gaps after duplicate removal; provider retries/backup can add attempts. All actual attempts share the same lifetime project budget as Phase 3, including failures. If limits or invalid output prevent completion, saved work remains and the job is labeled partial. No fabricated filler is added to reach 30. Start generation again to continue after resolving the issue. A cancelled or interrupted job does not auto-resume.

Duplicate checks normalize case/punctuation and conversational wording while retaining meaningful differences such as brands, regions, amounts, negation and migration direction. This is a conservative lexical check, not proof of semantic uniqueness. Prompts also request distinct questions. Archived questions are included in duplicate checks; restore one instead of adding it again. The library is capped at 300 total questions and four buyer types. Generation locks library editing/selection until it stops; stale edits and stale selection updates are rejected.

Recommendations are planning heuristics, not measured search demand. A $0 estimate assumes currently listed free access and account allowance; it is not a guaranteed bill or entitlement. If neither configured route can be verified, cost is shown as unavailable. Estimates cover isolated answers only, exclude answer analysis, use rough input-token counts and configured output ceilings, and state the retry limit. Provider/model/key details remain server-side.

## Landing page and workspace

- `/` introduces AnswerLens, its current capabilities, workflow, answer results, content insights and plans.
- `/projects` opens the existing project list, and `/onboarding` creates a project.
- The landing page includes a responsive menu, an interactive fictional page-evidence example, and expandable questions and answers. No additional dependencies are required.
- Workspace links now point to `/projects`. Existing project detail URLs and saved database records are unchanged.

### Reported compiler and warning fixes

- Removed `autoSelectFamily` from the HTTP request options; the explicit, validated address family and pinned DNS lookup remain in place.
- Validate the worker ID before copying it into an explicitly typed string, preserving that type inside nested crawler callbacks.
- Export a named PostCSS configuration object.
- Mark the runtime database path with Turbopack's tracing opt-out so mutable SQLite data does not cause the entire project to be bundled as an asset.

## Run locally

Use Node.js 22.12+ and npm. In the project directory:

```powershell
npm install
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run db:migrate
npm run dev
```

Open http://localhost:3000. `npm run dev` starts the web application plus the crawl, company-profile, buyer-question and insights workers; stopping the command stops all five processes. The default Next port must be free. No AI key is needed for Phases 1 and 2 or for manually adding/editing buyer research.

Database migrations also apply automatically on the first database connection. SQLite files are written to `data/answerlens.db` by default. Keep the web application and all four workers in the same project directory with the same DATABASE_PATH. Back up with a SQLite-aware backup tool, or stop all five processes before copying the database and any WAL/SHM files together.

The web server binds to loopback. API requests also enforce local host and same-origin access. This is a single-user local application, not a hosted or authenticated service.

## Owner verification

The following commands are provided for the project owner; they have **not** been run by the coding agent:

```powershell
npm run typecheck
npm run lint
npm run build
npm run test:audit
npm run test:profile
npm run test:questions
```

For a production-mode local session, after a successful build:

```powershell
npm start
```

Suggested manual verification:

1. Create a project with a company and two competitors, using public domains you are permitted to crawl.
2. Discover each website. Review robots access, sitemap counts, and page candidates before starting.
3. Queue crawls and watch their progress. Each run must remain responsive, with page failures visible separately.
4. Inspect a collected page's content, headings, links, schema, and metadata.
5. Filter failed/skipped pages, inspect history, cancel a running crawl, and confirm already-collected pages remain.
6. Edit competitors after crawls stop, then confirm archived website history remains selectable.
7. Confirm private addresses, localhost, credential-bearing URLs, non-HTTP protocols, duplicate domains, and unsafe redirects are rejected.
8. Resize to a narrow screen and navigate the forms and evidence drawer using the keyboard.

### Phase 2 testing checklist

Use this checklist to verify the technical audit before moving to Phase 3. All boxes start unchecked; expected results below are acceptance criteria, not claims that testing has passed.

#### 1. Prepare and run the code checks

- [ ] Stop the previous web application and crawl worker, then restart them with `npm run dev`. Open an existing Phase 1 project. **Expected:** the automatic migration adds audit storage without losing projects, crawl history, or collected pages.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run test:audit`, and `npm run build` using the commands above. **Expected:** each finishes successfully; save the full output of any failure. A successful build does not replace the manual checks below.
- [ ] Use an existing completed Phase 1 crawl, a new crawl, and at least one competitor crawl for the checks below. Start with the 25-page cap. No AI API key is needed.

The automated audit tests live in [tests/audit/engine.test.ts](tests/audit/engine.test.ts). They cover rule IDs/evidence, HTTP and JSON errors, unknown/broken links, redirect aliases and incoming links, missing legacy signals, robots agent scope, canonical/noindex findings, schema graphs, FAQ text matching, exact/near duplicates, llms.txt handling, and HTML extraction. They do **not** verify the complete UI, database migration, worker lifecycle, or real network requests.

#### 2. Verify the complete audit workflow

- [ ] **Audit an older crawl:** open Overview or Website, select the Phase 1 crawl, and choose **Audit saved pages**. **Expected:** supported checks produce a saved audit; checks requiring new signals show **Unavailable**. Original page content and collection timestamps stay unchanged. Auditing saved evidence must not start another website crawl.
- [ ] **Audit a new crawl:** discover a website, start its crawl, and wait for collection to stop. **Expected:** a technical audit appears automatically, with separate **Errors**, **Warnings**, and **Observations**, a rule version, collection time, and analyzed HTML-page count. The analyzed count may be lower than attempted pages because failed/skipped pages are not collected HTML.
- [ ] **Check Overview and Website:** open both project views. **Expected:** the same selected crawl has the same audit counts and findings in both views. The existing page inventory and crawl controls still work.
- [ ] **Check website and history scope:** switch between your company, a competitor, a specific historical crawl, and **Latest crawls**. **Expected:** results belong only to the selected scope. Latest crawls means the latest crawl per active website; a new unaudited crawl must not silently show the previous crawl's findings as current.
- [ ] **Check issue filters:** select each severity using both the count buttons and dropdown; combine category, rule, and title/URL search; then clear the filters. **Expected:** rows match every selected filter. Severity totals describe all findings in the selected audited snapshots **before issue filters**; the results footer describes the filtered list. A no-match search shows a clear empty state.
- [ ] **Check pagination:** use a scope with more than 20 matching findings and navigate Next/Previous. **Expected:** at most 20 findings appear per page, the footer range and total are correct, and pagination does not repeat or omit rows. Record this as untested if your sample has too few findings.
- [ ] **Inspect an issue:** expand at least one error, warning, and observation where available. **Expected:** each includes a rule ID, explanation, suggested fix/review, evidence values, and source links. Page evidence includes its original observation time. A live source link may show a newer page than the saved evidence.
- [ ] **Inspect the page drawer:** select **Open page evidence** from a page-level issue. **Expected:** the drawer opens on **Audit**, showing findings for that page and crawl. Content, Headings, Links, Schema, and Metadata still work. Site-level findings remain accessible in the main audit section even when they have no page drawer link.
- [ ] **Inspect coverage:** expand **Check coverage & limitations** for each audited website. **Expected:** Findings, No finding, Unavailable, and Inapplicable are separate. Failed/uncollected HTML and missing Phase 2 signals must not count as passed checks. There is no invented SEO health or AI visibility score.
- [ ] **Check partial collection:** cancel a crawl after it has collected some pages, then inspect its audit. **Expected:** collected pages remain available and limitations identify the partial crawl. Also review a crawl that reaches its page cap; link and duplicate results must describe the collected sample, not the entire site.
- [ ] **Check saved history:** note a finding and its evidence, run another crawl, then select the earlier crawl again. Refresh the browser and restart the application. **Expected:** the old audit retains its evidence, counts, timestamp, and rule version; new website content does not overwrite it. Repeated audit requests for the same crawl/version must not duplicate findings.
- [ ] **Check failures if encountered:** if the audit fails, inspect its error message and use **Audit saved pages** to retry. **Expected:** the crawl's collected pages remain intact and a successful retry saves one audit. A failure to fetch optional llms.txt must not turn an otherwise successful crawl into a failed crawl. Mark recovery untested if no audit failure occurs.
- [ ] **Check keyboard and narrow layouts:** navigate filters, expand findings, open the evidence drawer, switch tabs, and close it using the keyboard; repeat on a narrow screen. **Expected:** visible focus, readable evidence, usable scrolling, and focus returning to the drawer's opener. Search typing must retain focus while results update.

#### 3. Spot-check individual rules

Use known pages from your crawl, or a **public test website you control**, for deliberate scenarios. The crawler intentionally rejects localhost/private-network targets. Where a scenario is not present, mark it untested rather than assuming it passed. The automated suite supplies several of these scenarios without requiring a public fixture.

| Scenario to inspect | Expected result |
| --- | --- |
| A collected request returns 404/410, or fails to complete | An HTTP/request error includes the recorded status or failure. It does not assert that a transient failure is permanent. |
| A page follows two or more redirects; another finishes on HTTP | The redirect warning shows the recorded chain. The HTTPS check flags the final HTTP page, not an HTTP request that successfully redirects to HTTPS. |
| Canonical is missing, invalid, duplicated, points elsewhere, or points to a collected noindex page | Applicable canonical findings include the declared URLs/directives. A different canonical is an observation requiring intent review; an uncollected target is not presumed indexable or noindex. |
| A robots meta/header directive targets a specific agent; robots.txt blocks AnswerLensBot on a path | Evidence retains the directive's agent scope. The blocked path is not fetched and is not mislabeled as a confirmed broken link. |
| A collected page is absent from a readable discovered sitemap | Sitemap absence is an observation. If no readable sitemap was collected, membership is unavailable. |
| Titles/descriptions are empty or shared by two distinct collected pages | Missing/duplicate metadata findings show the relevant values and matching URLs. Identical metadata on a competitor or another crawl must not create a cross-crawl duplicate finding. |
| Title falls outside 15–65 characters, H1 count is zero/multiple, headings skip levels, or extracted text is under 100 words | Applicable observations disclose their counts or heading text. These are review heuristics, not claimed ranking penalties. |
| A page has no internal anchors, or no incoming links from other collected pages | The appropriate link observation appears. Potential-orphan wording states that the graph is partial; self-links do not count as incoming links, and recorded redirect aliases should resolve to the fetched destination. |
| An internal destination has a recorded 404/410; another is unvisited or timed out | Only the confirmed 404/410 is labeled a broken internal link. Unknown destinations remain unevaluated; when there is no confirmed break but destinations are unknown, the check is unavailable. |
| JSON-LD is invalid JSON; valid entities appear inside arrays or `@graph` | Invalid JSON produces a syntax error with an excerpt. Valid nested entities are recognized; valid JSON alone is not presented as complete schema validation. |
| Relevant homepage/product/FAQ/deep-path pages lack selected schema types | Optional schema opportunities are observations, with relevance caveats. They do not promise search features or AI citations. |
| FAQ markup contains a question/answer present in HTML, then one absent from HTML | Matching normalized text does not generate a mismatch. Missing/unresolved question or answer content prompts review and acknowledges JavaScript limitations. |
| An article-like page lacks an author/publication date or has malformed/inconsistent dates | Applicable observations show what was captured. A missing modification date alone must not demand a fabricated update date. |
| The collected sample has no captured company identity/contact indicators | Site-level observations describe the inspected sample and extraction limits, not a claim that the company is illegitimate or has no contact information anywhere. |
| Pages have identical non-empty text, or substantial near-identical main text | Exact/near-duplicate observations point to matching pages in the same crawl. Near comparison uses the documented 85% shingle threshold and minimum text length; exact matches are not reported again as near matches. |
| A page has little server HTML text plus scripts or an enable-JavaScript notice | It is labeled possibly JavaScript-dependent, not proof that rendered content is missing. |
| llms.txt returns 200, 404/410, an HTML body, an error, or truncated content | Saved response outcomes remain distinct. HTML/format problems are observations; truncated content has unavailable format checks. Absence is not a ranking error, and presence is not proof a model will use or cite the site. |
| robots.txt differs for named AI-related tokens | The observation retains saved policy evidence and evaluates the named tokens at the homepage path only. It makes no claim about actual visits, training, citations, or universal access. |

See [audit methodology](docs/audit-methodology.md) for exact thresholds and limitations.

#### 4. Record the result before starting Phase 3

- [ ] Record each checklist item as passed, failed, or untested, with the crawl/website used. Unchecked scenarios remain unverified.
- [ ] For a failure, capture: steps to reproduce, expected versus actual behavior, selected website/crawl, rule ID and affected URL if relevant, screenshot where useful, and full terminal or browser-console error text.
- [ ] Confirm that every inspected issue has evidence, an explanation, and a fix/review action, and that errors, warnings, and observations remain clearly separated.

**Phase 2 verification remains pending until the owner runs these checks.** No test results or build success are claimed by the coding agent. The owner has authorized implementation of Phase 3.

### Phase 3 testing checklist

These are optional manual checks for the owner; they were not performed by the coding agent. The subsequent UX update passed the code-level checks listed at the top of this README. Browser/UI checks remain unperformed.

- [ ] Add server keys and restart all five processes. Existing projects, crawls and audits remain available.
- [ ] Run the owner verification commands above. The existing profile test source covers schemas, quotes, conflicts, model filtering, configuration bounds and redaction; it does not exercise the live workflow.
- [ ] Open Company profile. No API-key fields, provider/model settings, token or cost tables, human-review queue, accept/reject/edit buttons or manual fact form appear.
- [ ] Pick one or two collected pages and select **Create company profile**. Progress updates and sourced details appear automatically with no approval step.
- [ ] Inspect several source quotes in the saved-page drawer. Quotes must occur in the supplied excerpt, with original URLs and collection times. Unsupported details must not be invented.
- [ ] Search and filter by topic; check pagination and switch target/competitor websites. Details stay scoped to the selected website across its saved crawls.
- [ ] If sources disagree, both claims and their sources remain visible under **Where sources differ**. Different dates or plans may explain the difference; no automatic winner is asserted.
- [ ] Repeat an identical completed selection: saved results are reused. Enable **Generate again instead of using saved results**: fresh requests occur within budget without duplicating identical facts.
- [ ] Stop queued and running work. Previously saved details remain available. Restart the app and confirm profile persistence.
- [ ] Stop the profile worker mid-job and restart after three minutes. Stale work ends with a plain failure message; saved details remain. Start another profile to continue.
- [ ] As owner, temporarily leave the primary key blank while keeping the backup configured, restart, then generate a profile. Reverse `AI_PRIMARY_PROVIDER` and repeat to check both backup paths. Restore configuration afterwards. The UI must not expose service names or keys.
- [ ] Remove both keys, or exhaust the configured allowance. The UI shows a plain unavailable/allowance message directing users to the site owner. It does not display raw provider errors or ask users for credentials.
- [ ] Inspect normal profile, source-selection and start-request responses: no keys, provider configuration or raw provider diagnostics. Detailed request records stay in the local database/owner diagnostics.
- [ ] Check keyboard use and narrow layouts for page selection, filters, progress controls and the evidence drawer. Source and search inputs retain focus while progress updates.

Record each case as passed, failed or untested. Include steps, website/crawl, expected versus actual behavior and sanitized error output for failures. The owner has authorized Phase 4 implementation.

### Phase 4 testing checklist

These are checks for the owner to run; none have been executed by the coding agent.

- [ ] Restart the app/workers with the existing database. Previous projects, crawls, audits and company facts remain intact; Questions navigation opens the new workspace.
- [ ] Run the owner verification commands above, including `npm run test:questions`. The new test source covers schemas, conservative duplicate handling, brand matching and recommendation coverage; it does not validate live generation, SQLite integration or the UI.
- [ ] With a company profile present, generate buyer research. Expect 2–4 suggested buyer types and at least 30 distinct active questions on successful completion, with both informational/commercial and branded/non-branded coverage. A partial/failed job is not a successful baseline.
- [ ] Inspect the role, company type, pain, criteria, objections, technical familiarity and commercial importance for each buyer type. Wording must describe hypotheses rather than observed customers. Edit a type, save, refresh and confirm persistence.
- [ ] Inspect journey stage, question type, geography, intent, relevant brands and answer needs. Questions should ask about unknown capabilities rather than assume them. Geography-sensitive wording should name the region. These are model suggestions; schema validation cannot prove semantic quality.
- [ ] Open supporting sources for generated questions. Linked facts must belong to the generation snapshot/project; quotes, URLs and collection times remain inspectable in saved page evidence. Questions without linked facts explain what information is still needed.
- [ ] Check that up to 20 questions are selected automatically for an initially unselected library. Change the set, clear it and use **Select suggested 20**. Selection persists across reload/restart, cannot exceed 20, and does not start any visibility run.
- [ ] Edit a question, add a custom one and try a duplicate with changed punctuation/case or conversational filler. The duplicate is rejected, including matches in the archive. Questions about different named brands, amounts, regions or negation should remain distinct.
- [ ] Archive a selected question: it disappears from Active and the saved selection. Restore it from Archived: it returns without being silently reselected. Repeated generation preserves edits and archives.
- [ ] In two tabs, edit the same record or change the selection using a stale view. The second stale save asks for refresh rather than overwriting newer work. Close/reopen a stale editor after refreshing.
- [ ] Check search, persona/stage filters, selected-only view, archived view and pagination; their counts refer to this project's library, not measured demand or AI visibility.
- [ ] Stop queued work and then running work. Already-saved personas/questions remain. Stop the question worker mid-job, restart after the three-minute lease, and confirm stale work is ended and pending usage marked interrupted. Generate again to continue; duplicate and existing-edit safeguards remain active.
- [ ] Test with missing server keys or exhausted allowance. Existing/custom research still opens and can be edited without keys. Generation gives a plain message; interrupted work never invents filler or marks an incomplete baseline complete. Provider names, keys and raw errors must not appear in the user workflow.
- [ ] Estimate a future run with 1, 3 and 5 samples. For 20 selected questions, expect 20, 60 and 100 planned answers. No answer request or experiment record is created. The estimate must become stale after selection/question/sample changes and label free-access uncertainty and insufficient allowance.
- [ ] Switch projects and verify that buyer types, questions, selections and evidence stay scoped. Check narrow layouts, keyboard focus, form labels, checkbox controls and the evidence drawer.

Record passed, failed and untested cases with steps and sanitized errors. Phases 5–9 have now been authorized and implemented; use the additional checklists above.

## Crawl behavior

- Homepage, discovered sitemap pages, then same-domain internal links; bare/www variants count as the same website. Other subdomains are not included.
- Three simultaneous requests at most per host; at least 250 ms between request starts, or a longer robots crawl delay. SQLite request leases share this limit between crawl workers and web previews.
- A robots delay over 60 seconds is reported as unsupported and no page request is sent, rather than shortening the requested delay.
- A fresh DNS safety check for each request and redirect, 12-second HTTP timeout, five redirects, 3 MB uncompressed response limit, standard HTTP(S) ports only.
- Robots errors other than 404/410 stop permission discovery. Sitemap failures are surfaced while eligible internal-link discovery can continue.
- Sitemap discovery is bounded to 12 files and 5,000 page candidates. Compressed sitemaps are not supported in Phase 1; their failures are disclosed.
- Only server-provided HTML is extracted. No browser rendering, authenticated crawling, cookie forwarding, CSS visibility evaluation, or downloaded binaries.
- JSON-LD checks include JSON syntax, selected type presence, and a bounded FAQ-to-HTML text comparison. This is not complete schema vocabulary validation or search-feature eligibility validation.
- New crawls collect `/llms.txt` after HTML collection, outside the page-attempt cap, with the same DNS, redirect, exclusion, robots, throttle, and response safeguards. Up to 100,000 characters are retained; truncation makes syntax checks unavailable. A failure to collect this optional file does not fail the crawl.
- The page cap includes failed/skipped attempts. A run can complete below the cap when its queue is exhausted.
- A worker interruption preserves collected pages and marks a stale run failed after its 90-second lease expires. Start a new crawl rather than resuming an incomplete Phase 1 run.
- The worker is local and must stay running. No scheduled or continuous cloud monitoring is implemented.

## Design decisions

See [docs/design-decisions.md](docs/design-decisions.md). The supplied DESIGN files remain untouched. Inter is bundled as an explicitly permitted Switzer substitute because the references contain no font assets.

## Implementation references

- [Next.js documentation](https://nextjs.org/docs)
- [Drizzle SQLite documentation](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)
- [robots-parser API](https://www.npmjs.com/package/robots-parser)

These support the framework and adapter choices; `plan.md` remains the product contract.
