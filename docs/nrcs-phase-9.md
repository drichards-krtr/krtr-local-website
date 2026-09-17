# Phase 9 - Integration and Rehearsal Preparation

## Status and Boundaries

The user verified Phase 8 dry-run and import in production. CMS editorial changes are frozen pending cutover. Delta/conflict cases have local regression coverage, not production acceptance coverage; artificial live edits are not required.

Phase 9 is integration/rehearsal, not the Phase 10 authority switch. Work remains on main, without agent commits/pushes. Separate Vercel applications, credentials, auth boundaries, and API-only communication remain mandatory. TipTap sanitized HTML and district awareness override original specification omissions.

## First Safety Step

Removed the NRCS Temporary Reset navigation, maintenance page, server action, and submit component. Apply `supabase/nrcs/migrations/20260918000600_retire_editorial_reset.sql` in NRCS only to retire the database RPC. This drops a capability, not editorial records. Keep historical migrations/tests; do not restore this function during rollback.

## Integration Gaps

- Web/Homepage/Alert delivery currently writes private CMS projections and validates non-public receipts. It does not create/update public articles, execute schedules, or return actual publication receipts.
- Existing Event synchronization is already live. Integration must retain this behavior and avoid pretending all publication types currently share the private boundary.
- Public presentation remains legacy CMS-driven. HTML/article carousel, listing Hero, primary video, taxonomy links, district routing, and preserved public IDs/slugs need end-to-end integration verification.
- Daily district-local expiry and Priority Alert replacement of Hero (including an empty Hero slot) need presentation-time eligibility and cache verification. Severe-weather display stays independent.
- The legacy editorial feature flag only hides/blocks legacy pages; it is not a publishing-authority or full write-enforcement switch. Retain legacy code and specify rollback before activating production publishing.
- Phase 9 specifies staging, but the user cannot use branch-preview auth URLs and does not keep local production credentials. An explicitly approved production-domain rehearsal boundary is needed before public writes.

## Decisions Required Before Public Integration

1. Approve building the live CMS adapter behind a default-off publishing flag, keeping current private receipts/public rendering unchanged until explicit activation. Rehearse in isolated local database fixtures and production private previews, since branch staging is unavailable.
2. Confirm legacy CMS public Story/Event tables should remain the presentation projection, preserving public IDs/slugs and existing URLs; NRCS is editorial authority after Phase 10. Extend presentation fields for sanitized HTML and ordered media, rather than introducing a second public content store.
3. Choose scheduled delivery operation. Recommendation: persist authenticated packages in CMS, evaluate due publication/expiry at server read time with bounded cache lifetime, and require explicit delivery of revised NRCS instructions. This must be designed/tested before activation; no undocumented cron or Vercel-plan assumptions.
4. Confirm rollback restores legacy UI and disables new publication application while preserving already delivered public content. Content rollback requires a separate snapshot/restore plan; UI rollback alone does not undo content changes.

## User Action Required - NRCS Supabase

Where: NRCS project > SQL Editor.
Action: Run the complete retirement migration once (safe to rerun).
Value: `supabase/nrcs/migrations/20260918000600_retire_editorial_reset.sql`.
Return: Confirm success or exact error, without credentials.
Verify: `select to_regprocedure('public.nrcs_temporary_editorial_reset(text)');` returns null.

## User Action Required - Deployment

Where: Repository main and NRCS Vercel project.
Action: User commits/pushes and deploys NRCS after SQL succeeds.
Verify: Temporary Reset absent from navigation; `/maintenance` returns the normal not-found page; existing NRCS content is intact. No CMS deployment, new environment variable, DNS, or auth change is needed for this preparation step. Do not disable legacy CMS editorial access or enable production publishing yet.
