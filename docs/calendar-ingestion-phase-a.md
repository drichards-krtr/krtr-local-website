# Calendar ingestion Phase A

Implemented locally on branch `codex/calendar-ingestion-foundation`. This phase establishes the ingestion contract and editorial foundation. It does not yet fetch sources, run Make schedules, implement Smart Cancel, or deploy infrastructure.

## Delivered behavior

- Independent Next.js ingestion project at `apps/calendar/_ingest`, with a health endpoint and authenticated normalized-run relay.
- NRCS Calendar Sources UI for adding, editing, enabling/disabling, feed URLs, providers, default classifications, and extraction notes; source health and recent run history.
- Seven editable seed records, disabled by default. The inaccessible city JSON endpoint is retained in that source's notes as an alternate transport.
- Dedicated NRCS integration API for enabled-source discovery and bounded run submission. CMS-authoritative district status is checked; an unavailable district API fails closed.
- Atomic run storage, replay detection, stable occurrence identities, unchanged-evidence suppression, and audit fields.
- Editor-only Calendar Intake approval creates an incomplete NRCS draft and preserves a permanent source relationship. Rejection records reviewer/time and 90-day eligibility for purge.
- Existing-event findings remain staged and never overwrite or restore canonical records. Applying update diffs is a later phase.
- Manual Events and ingested Events share publication completeness requirements. Drafts may omit all publication-required fields. Blank titles display as Untitled draft.
- CMS receives visibility-only updates for draft/archived Events, preserving prior public content while hiding it. A never-published draft does not create a CMS record.

## Deployment order and user setup

Do not deploy only the NRCS code: draft sync depends on the accompanying CMS changes.

1. **CMS Supabase:** apply `supabase/migrations/20260923000100_calendar_draft_visibility.sql`, then deploy the CMS receiving route update from the repository root.
2. **NRCS Supabase:** apply `supabase/nrcs/migrations/20260923000100_calendar_ingestion_foundation.sql` and then `20260923000200_calendar_seed_sources.sql`. These add tables and allow incomplete drafts; they do not delete existing Events. Publication validation applies on future writes without rewriting historical records.
3. **NRCS Vercel project** (root `apps/nrcs`): add `NRCS_CALENDAR_INGEST_SECRET`, then deploy NRCS changes.
4. Create the **Calendar Ingestion Vercel project**, same repository, Root Directory `apps/calendar/_ingest`, Next.js preset, `npm ci` install and `npm run build` build. Add the variables below and deploy.
5. Confirm NRCS pages load, edit a disabled source, enable a test source, submit the sample run, approve to draft, complete required fields, and explicitly publish. Verify the CMS receipt and public visibility. Restore any test source to the intended enabled state.

No migrations have been applied to live Supabase and no Vercel project or secrets have been configured by this implementation.

| Variable | Vercel project | Value source | Environments and redeploy |
| --- | --- | --- | --- |
| `NRCS_CALENDAR_INGEST_SECRET` | NRCS and Calendar Ingestion | Generate 32 random bytes, encode as 64 hex characters, and use the same value in these two projects. Dedicated to calendar ingestion; never reuse the CMS secret. | Configure matched Development, Preview, Production pairs; use separate values and isolated databases for Preview/Development. Redeploy both projects after adding or rotating. |
| `CALENDAR_ORCHESTRATOR_SECRET` | Calendar Ingestion | Independently generate another 32 random bytes as hex. The submitting Make integration will use this bearer token. | Development, Preview, Production with separate values. Redeploy ingestion after changes. Configure Make later, when scans are implemented. |
| `NRCS_API_BASE_URL` | Calendar Ingestion | Canonical HTTPS origin of the corresponding NRCS deployment, without a path. Local HTTP is allowed only for localhost/127.0.0.1. | Match each environment to its NRCS deployment. Redeploy ingestion after changes. |

Generate each secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and enter it directly into the intended environment's secret settings; do not commit generated values. Existing NRCS Supabase and CMS integration variables remain necessary, including for read-only district verification. The ingestion deployment gets no database service-role key and no CMS publication secret.

## Integration contract

`GET /api/calendar-ingestion` on NRCS returns enabled sources in enabled CMS districts. Authenticate with `NRCS_CALENDAR_INGEST_SECRET`. The initial source cap is 1,000; larger inventories fail explicitly instead of truncating silently.

`POST /api/runs` on Calendar Ingestion accepts the following payload using `CALENDAR_ORCHESTRATOR_SECRET`. It forwards to NRCS `POST /api/calendar-ingestion` using the dedicated NRCS integration secret. Direct NRCS submission is also supported for manual integration testing.

```json
{
  "run_id": "a0000000-0000-4000-8000-000000000001",
  "source_id": "cafe0000-0000-4000-8000-000000000001",
  "status": "success",
  "inventory_complete": false,
  "window_start": "2026-09-23T00:00:00Z",
  "window_end": "2026-12-22T00:00:00Z",
  "candidates": [
    {
      "external_event_id": "manual-fixture:2026-10-01",
      "fields": { "title": "Manual integration test", "start_at": "2026-10-01T19:00" },
      "source_excerpt": "Synthetic integration fixture; do not publish.",
      "raw_payload": { "fixture": true }
    }
  ]
}
```

Enable the test source first. Use a new run UUID for each new scan; retries reuse the identical payload and UUID. Occurrence IDs must be stable across scans. If a feed lacks IDs, its adapter must create a deterministic occurrence identity before submission. Exact source+occurrence+normalized-field matches suppress unchanged findings; fuzzy or cross-source matching is not yet implemented.

Limits: 1 MB body, 500 findings per run, 90-day maximum window. A capped/truncated source inventory must report partial status; Phase A has no batch-finalization protocol. Failed runs have no candidates. Facebook Explore can never mark its inventory complete. No disappearance detection runs in this phase.

Candidate fields are restricted to title, sanitized body_html, location_name, address, city, state, zip, start_at, and end_at. Missing facts remain null. Source images, registration links, original timezone/all-day metadata may be retained as raw evidence but are not yet canonical fields. No source image is saved to Cloudinary by approval.

For this phase, event times must be district-local `YYYY-MM-DDTHH:mm[:ss]`, matching the existing NRCS timestamp model; offset-bearing event timestamps are rejected rather than silently stripped. Scan-window boundaries require offsets. Structured adapters must not be enabled until timezone/all-day/recurrence handling is implemented and verified; date-only or time-TBD findings remain incomplete drafts.

## Validation and next phase

Local validation passed: standalone ingestion `npm run build` using its own locked dependencies; NRCS production build with webpack; root CMS TypeScript check; and the integration/PostgreSQL harness below. The NRCS build also required correcting the existing Users page to await Next.js search parameters. No live authenticated browser or production database verification has been performed.

`tests/calendar-ingestion.mjs` tests TypeScript validation and API boundaries, then applies the actual new migrations to a disposable PGlite PostgreSQL database with a small existing-NRCS fixture. It checks SQL permissions, run replay, draft approval, publication requirements, archived-event protection, rejection retention/suppression, and CMS visibility updates. Run with `PGLITE_MODULE` pointing to an installed `@electric-sql/pglite` module if it is not on the default module path.

Remaining phases: adapter execution and Run Now; scheduling; timezone/all-day handling; deterministic cross-source matching; update review/apply workflow with concurrency protection; cancellation label/public state; Smart Cancel and Follow-Ups; normalized geography/native-town filters; dashboard summaries; explicit image saving; rejection cleanup; provider bake-off and paid integrations. The existing public calendar's historical 500-row limit remains a tracked prerequisite before production ingestion volume.
