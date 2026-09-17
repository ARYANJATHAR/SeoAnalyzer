# AnswerLens

A local-first website research workspace for a B2B company's AI discoverability. The complete product specification lives in [plan.md](plan.md), and [DESIGN](DESIGN/DESIGN.md) supplies the primary visual theme.

## Current scope: Phases 1–3

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

The repository originally contained only the specification and design folder. The minimum Phase 0 app/database foundation is included so Phase 1 has a runnable structure. The full seeded portfolio demo belongs to Phase 9.

**Verification status:** The owner confirmed Phase 1 crawling works and authorized Phase 3. Phases 2 and 3 are written; verification remains with the owner. The coding agent has not run tests, type checks, lint, builds, migrations, application previews, or authenticated AI requests for Phase 3.

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

### AI providers and company profile (Phase 3)

- **Company profile** navigation at `/projects/[projectId]/profile`, for the target website and competitors.
- NVIDIA and OpenRouter behind a common adapter. Either can be primary, with optional reciprocal backup using the same explicitly mapped model.
- Default: **Nemotron 3 Super 120B A12B**. Six curated shared model mappings, live catalog checks and free-only OpenRouter routing; no silent paid-model substitution.
- Server-environment keys, credential validation, generation limits and a project-wide request budget.
- Source selection and usage estimates before a separate worker extracts facts from saved pages.
- Zod output validation, source-quote matching, one bounded repair attempt, and unreviewed model proposals.
- Accept/reject/edit facts, add sourced human-confirmed facts, inspect page evidence, and preserve review revisions.
- Deterministic potential-contradiction groups that retain both claims for human resolution.
- Attempt-level usage ledger, cancellation, partial results, stale-worker recovery, and reuse of completed selections/validated exact page requests.

Research on **September 17, 2026** found 24 OpenRouter entries with zero prompt/completion prices and 82 NVIDIA catalog entries. These include specialized models; NVIDIA's count is not a verified count of unrestricted free chat models. See [provider research and model IDs](docs/ai-providers.md) for the six shared choices and sources. The app refreshes availability rather than relying solely on this snapshot.

**Backup limitation:** OpenRouter's default free Nemotron route lists NVIDIA as its upstream. Endpoint switching can help with some API/key/quota problems, but cannot guarantee recovery from a shared upstream outage.

#### Set up Phase 3

1. Create keys at [NVIDIA Build](https://build.nvidia.com) and [OpenRouter](https://openrouter.ai/settings/keys). One provider can work; both keys are needed to use both backup paths.
2. Edit your existing `.env.local` and set `NVIDIA_API_KEY` and `OPENROUTER_API_KEY`. Use `.env.example` as a reference; do not overwrite an existing environment file. Never use `NEXT_PUBLIC_` for keys or place them in browser code.
3. Restart with `npm run dev`. Migration `0004_company_profile.sql` applies automatically. The command now starts the web app, crawl worker and company-profile worker. Keep the existing database.
4. Open **Company profile → AI providers & request budget**, choose settings and save. Defaults: NVIDIA primary, backup enabled, Nemotron 3 Super, 4,096 output tokens, temperature 0.1, 60-second timeout, 50 total project requests, up to six pages per extraction.
5. **Validate saved configuration** for each configured provider. Validation uses a tiny real inference request and consumes request allowance; public catalog reads alone do not validate a key.
6. Select a website/crawl and source pages. Review the data disclosure and estimate, then **Extract facts**. Review proposals and confirm only claims you accept.

Only selected public page text, source URL and collection time are sent for extraction. Project notes and confirmed facts are not sent. Provider data policies apply. Crawling, audits and manually adding sourced facts still work without AI keys.

## Landing page and workspace

- `/` introduces AnswerLens, its current capabilities, workflow, and planned AI features.
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

Open http://localhost:3000. `npm run dev` starts the web application, crawl worker and company-profile worker; stopping the command stops all three. The default Next port must be free. No AI key is needed for Phases 1 and 2.

Database migrations also apply automatically on the first database connection. SQLite files are written to `data/answerlens.db` by default. Keep the web application and both workers in the same project directory with the same DATABASE_PATH. Back up with a SQLite-aware backup tool, or stop all three processes before copying the database and any WAL/SHM files together.

The web server binds to loopback. API requests also enforce local host and same-origin access. This is a single-user local application, not a hosted or authenticated service.

## Owner verification

The following commands are provided for the project owner; they have **not** been run by the coding agent:

```powershell
npm run typecheck
npm run lint
npm run build
npm run test:audit
npm run test:profile
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

These are expected results, not completed checks. Use one or two saved public pages first. Validation, retries and repairs consume allowance even on free routes.

#### Setup, routing and budgets

- [ ] Restart all three processes after adding keys. **Expected:** existing projects/pages/audits remain intact, Company profile opens, and provider cards show only **Key configured** or **Key missing**.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run test:audit`, `npm run test:profile`, and `npm run build`. **Expected:** each succeeds. Profile tests cover pure schema/quote checks, conflicts, free-model filtering, settings and redaction; they do not verify live providers, the complete worker, or the UI.
- [ ] Refresh model availability. **Expected:** explicit mappings, current catalog counts and verified common choices. Missing/unknown/paid options are not treated as available; the NVIDIA catalog count is not presented as account quota.
- [ ] Save and validate each provider separately. **Expected:** actual provider/model and a request attempt appear in usage. Missing/invalid credentials produce a useful message without returning keys or provider error bodies.
- [ ] Test **NVIDIA → OpenRouter** backup: keep a working OpenRouter key, temporarily leave NVIDIA's key blank, restart, choose NVIDIA primary with backup enabled, and extract one page. **Expected:** an OpenRouter backup attempt. Reverse the providers and repeat, then restore both keys. This tests missing-key routing; mark network/429/5xx recovery untested unless separately observed.
- [ ] Repeat with backup **disabled**. **Expected:** a missing primary key blocks extraction; the other provider is not called. Shared upstream outages may still affect both providers when backup is enabled.
- [ ] Set the total budget equal to attempts already used, or use a fresh project's one-request budget and consume it with validation. **Expected:** further inference is blocked. Increase the total ceiling and start a new extraction to authorize more. Failed attempts, retries, repairs and validation count; catalog reads and cached reuse do not.
- [ ] Inspect browser network responses, console, page source and application logs. **Expected:** no configured key values. Do not include real keys in bug reports.

#### Extraction and fact review

- [ ] Select a website/crawl and source pages. **Expected:** the preview shows the exact source selection, 8,000-character cap, approximate tokens and request range. Nothing is sent to a model until extraction or credential validation is explicitly started.
- [ ] Start extraction while using Website/Overview. **Expected:** the separate worker processes the job without stopping crawler progress. Proposed facts start **unreviewed**, with category, subject, attribute, value, confidence, quote, source URL and original collection time.
- [ ] Compare several quotes with **Inspect saved page**. **Expected:** every accepted generated quote occurs in the saved excerpt sent to the model. The interpretation still requires human review; model confidence is not verified truth.
- [ ] Accept one proposal, edit/confirm another and reject a third. **Expected:** counts and filters update, source evidence remains intact, previous revisions are visible, and editing clears the original confidence score. Refresh and restart to check persistence.
- [ ] Edit the same fact in two browser tabs. **Expected:** the second stale save asks for refresh instead of overwriting the first review.
- [ ] Add a manual fact using a valid saved-page quote, then try an absent quote. **Expected:** the valid fact is human-confirmed without AI; the unsupported quote is rejected. This works without provider keys.
- [ ] Add two facts for the same website/category/subject/attribute with different values. **Expected:** both appear in a potential-contradiction group. Refine attributes for different plans/regions, or reject an incorrect fact to resolve it; no model silently chooses a winner.
- [ ] Switch between company and competitor. **Expected:** facts and conflicts stay website-specific. Source-crawl selection changes extraction/manual sources, not the entire historical fact list. Check fact filters and pagination.

#### Cache, cancellation and recovery

- [ ] Repeat a completed selection with unchanged generation settings and fresh extraction unchecked. **Expected:** saved results are reused without new attempts. A different subset within the same crawl can reuse exact validated page outputs, noted in extraction history.
- [ ] Enable **Request a fresh extraction** and repeat. **Expected:** new attempts within budget; identical saved facts and human review decisions are not overwritten. New differing proposals remain unreviewed.
- [ ] Cancel a queued job, then a running multi-page job after one page saves. **Expected:** queued work stops, the active request is aborted where possible, and saved facts remain. Interrupted calls may still consume provider allowance.
- [ ] Stop the profile worker during a job; restart after the three-minute lease window. **Expected:** stale work is failed, pending usage is interrupted/unknown, and facts remain. Start another extraction to continue; this is not automatic resume.
- [ ] If invalid/truncated output occurs, inspect warnings and usage. **Expected:** one repair opportunity, then no facts accepted from the invalid page; successful pages remain available. Mark untested if not observed—the pure tests do not verify live repair behavior.
- [ ] Inspect primary/backup/retry/repair usage where available. **Expected:** actual provider/model identities and attempt purposes, unknown usage kept unknown, and reported cost subtotals distinguished from the $0 free-route estimate.
- [ ] Check narrow-screen and keyboard use for settings, source selection, fact reviews, the evidence drawer and usage table. **Expected:** visible focus, readable content, functional scrolling, and search input retaining focus during polling.

Record each case as passed, failed or untested. For failures, capture steps, selected website/crawl or extraction, affected fact, expected/actual behavior, and full sanitized error output. Phase 4 requires a new instruction.

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

## Next phases

Phase 4 (not started) adds personas and buyer questions. AI visibility experiments, visibility metrics, content gaps, broader recommendations, exports and the no-key seeded demonstration remain in later phases. Phase 3 provider backup and fact extraction do not constitute a visibility experiment.

The UI labels future navigation as unavailable and never invents provider results or visibility scores. Company/competitor management currently lives in Project settings; the dedicated competitor analytics view arrives later.

## Design decisions

See [docs/design-decisions.md](docs/design-decisions.md). The supplied DESIGN files remain untouched. Inter is bundled as an explicitly permitted Switzer substitute because the references contain no font assets.

## Implementation references

- [Next.js documentation](https://nextjs.org/docs)
- [Drizzle SQLite documentation](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)
- [robots-parser API](https://www.npmjs.com/package/robots-parser)

These support the framework and adapter choices; `plan.md` remains the product contract.
