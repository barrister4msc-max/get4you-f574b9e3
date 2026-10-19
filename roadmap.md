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
