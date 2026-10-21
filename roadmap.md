## Switch price research to Lovable AI
- [x] Correct mismatched renovation/moving quotes labeled as general cleaning; 43 tests pass, server returns no_comparable_offers for Haifa 100m², form removes wrong recommendation and preserves manual budget
- [x] Add city → region → Israel fallback; 40 tests passed; live country sources persisted and Haifa form showed Israel provenance/min/max/midpoint with budget changed only on click; no orders/payments
- [x] City → matching region fallback; normalize OSM Hebrew punctuation; live Haifa + Haifa/Krayot searched but no applicable deep-cleaning 100 m² offer
- [x] Replace own OpenAI credentials with Lovable AI Responses; keep verified native sources and separate pause/cache state
- [x] Deploy and verify Tel Aviv 100 m²: ILS 1800–2500, midpoint 2150, cache reused; actual USD form applied 692.64 only on click; no order/payment
- [ ] Resolve slow uncached research exceeding the 150s request boundary — successful form verified from cache; uncached path remains unreliable

## OpenAI native web-search price research
- [x] Securely save user's OPENAI_API_KEY; verify authenticated model listing and use documented gpt-5.5
- [x] Replace mandatory Firecrawl with native OpenAI web_search, provider source evidence, fetched quote verification and saved search metadata; separate provider cache/pause state
- [x] Keep ILS range on conversion failure; preserve explicit application, debounce and stale-response guard; 35 rule tests pass
- [x] Deploy estimate-task-price; confirm Lovable AI 9-credit monthly cap and separate OpenAI credit_balance_exhausted without increasing limits; persist OpenAI pause
- [x] Verify real Haifa 100 m² USD form: exact server failure, retry, manual $100 retained; no order/payment created
- [x] Own OpenAI verification superseded by user-authorized Lovable AI integration above; separate OpenAI pause retained
- [ ] Publish screen changes to 4you.ai — requires user request to publish

## Restore price recommendation
- [x] Diagnose actual unavailable response: USD skipped web lookup; no persistent summaries; search connected and returns HTTP 200
- [x] Persist verified source summaries with expiry; refresh without destructive overwrite; persist terminal provider pause
- [x] Convert ILS once with a verified rate; explicit apply only; area/type/windows matched
- [x] Test rules and verify real form failure: confirmed city, unchanged $100 manual budget, clear spending-limit message, no order publication
- [x] Live available server → form → budget verified via Lovable AI; saved source summary reused
- [ ] Price additional free-text work — blocked by missing documented scope/unit/quantity and applicable verified offers; currently refuses a misleading standard-cleaning estimate

## Homepage typography scale-up (all elements)
- [x] Apply homepage-scoped computed sizes: logo 24, nav 18 semibold, controls 18, service label 24 bold, service/button text 18 semibold (16 phone), banner H1 48-52 desktop (32-36 mobile), banner copy 20 desktop / 18 mobile, section H2 32 desktop (24-28 mobile), step/card titles 20 semibold, body/FAQ/links/footer 18, utility captions >=14
- [x] Buttons min-height 48 with padding adjusted; drop fixed heights that clip; allow long names to wrap
- [x] Verify computed font-size + screenshots RU/EN/HE desktop and mobile, no clipping, overlap or horizontal scroll; report menu, service button, banner copy and step-description sizes
- [x] Make sticky header opaque and stop long service names splitting mid-word on phones

## Homepage typography

## Homepage typography
- [x] Increase typography across homepage, navigation and footer with homepage-only styles
- [x] Match service buttons to yellow primary CTA; preserve exact service links
- [x] Verify desktop/mobile RU/EN/HE at 360/390/1024/1426px, FAQ, service transitions and no overflow or support overlap; 16 routing tests passed

## Integrated homepage hero
- [x] Integrate compact service buttons into the existing uninterrupted banner
- [x] Verify desktop/mobile RU and HE, service selection, and no horizontal overflow

## Order address privacy
- [x] Inspect deployed views, RPCs, direct table policies and public consumers
- [x] Apply privacy migration, closed JSON contract and caller-scoped translation inputs
- [x] Test five synthetic PostgreSQL roles in isolation; verify deployed guest/unrelated API and detail page
- [x] Report applied environment and verification limits in address privacy report
- [ ] Verify production owner/assignee/admin readback — blocked by unavailable authorized sessions for an existing moving task
- [ ] Verify nearby/recommended HTTP results — blocked by existing ambiguous overloads PGRST203; search redesign outside this task

## Flow4You appearance restoration
- [x] Restore original banner gradient, accent heading and separate bright illustration
- [x] Preserve compact services and verify mobile/desktop RTL without changing order flows

## Final homepage and consistency audit
- [x] Move existing services above introduction; improve form readability and mobile targets
- [x] Remove unconfirmed homepage/pre-login figures and coordinate debug UI
- [x] Verify RU/EN/HE, moving/cleaning fields, calendar and signed-in draft restoration
- [x] Read-only audit of deletion, public view, notifications cascade, realtime and schedule trigger
- [x] Report results, required settings and limitations
- [ ] Actual single-publication and delete/list/notification convergence E2E — blocked by shared production backend; needs isolated test environment with test accounts and notifications disabled

## Service → order form
- [x] Service cards open the form with the service preselected (exact registry)
- [x] URL choice beats old draft; AI/voice cannot change it
- [x] Sign-in restores the draft, never auto-publishes; double publish blocked

## Service fields & execution date
- [x] Service parameter config (cleaning, moving), auto title
- [x] "When" block with date popover, time modes, Jerusalem time, client+server checks
- [x] Shown on review and task page; kept in draft

## Task visibility & deletion
- [x] Server: public reads return only open tasks (verified RPCs/view/RLS)
- [x] Drafts: owner/version/TTL, single-flight publish
- [x] Live removal of deleted tasks across lists (realtime + tab focus + stale-response guard)
- [x] Removed-task notifications are hidden locally; missing-task page is neutral (server deletion E2E remains blocked above)
- [x] Garbage audit report (IDs + reasons), no deletion
- [x] Cleanup of listed records

## Auth / publish / internet prices (Oct 2026)
- [x] Single post-auth handler, no code exchange, no silent home redirect, safe logs
- [x] Draft not overwritten before auth restores; fixed budget consistent; idempotent publish id; signup no longer claims "publishing"
- [x] Internet price lookup verified end-to-end via Lovable AI for Tel Aviv; uncached latency caveat recorded above
- [ ] Live Google/Apple/signup end-to-end check — blocked: database was unreachable during this session
- [x] Owner tariff: regular/deep cleaning 500–700 ₪ shown instantly; cleaning types (regular/deep, renovation, move) never share quotes
- [x] Pre-load renovation cleaning prices (saved 30 days, answers instantly from saved city/region/country)
- [ ] Move-out cleaning prices: real offers saved but quoted per number of rooms; form asks m² — waiting on owner choice (add rooms field?)
- [x] Answer: overview of AI features for the app
- [ ] Draft thread: finish Google OAuth (no competing redirects, keep language+form, resume action, open already-published task, no English home) + E2E incl. repeated callback/reload
- [x] Price history checked before web search; midpoint recommended; 100/200 m² + ILS/USD verified (only 1 completed cleaning order, no area — history not yet usable). Gemini fallback for web search not built (same credits pool)
- [x] Diagnose Google 'failed to sign in with vendor': backend DB unreachable; recovered; redirect race + language overwrite fixed in code
- [ ] Real Google+Apple sign-up/sign-in checks (draft restore, no dupes, cancel, logout) — after backend recovers
