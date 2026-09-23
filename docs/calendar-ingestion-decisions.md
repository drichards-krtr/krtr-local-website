# NRCS Calendar Ingestion Pipeline decisions

Recorded September 20, 2026, following review of the supplied Beast Mode V1 specification version 1.1. These user decisions supersede conflicting behavior in that document. This records requirements; it does not indicate implementation or deployment is complete.

## Deployment and ownership

The ingestion service belongs at `apps/calendar/_ingest` and will have its own Vercel project with that Root Directory. Adapters, extraction, normalization, and provider integrations belong in this service.

Source Registry, Calendar Intake, editorial review, canonical Events, flags, Follow-Ups, and dashboard remain in `apps/nrcs`. The NRCS database owns authoritative records and operational history. Make.com schedules and orchestrates scans. Public CMS receives changes only through the NRCS publication path.

## Approval and publication

Approve means keep the candidate for further editorial review and polishing. It does not mean publish. Publication requires a separate explicit editorial action after review.

This supersedes the specification's immediate-publication rule, including section 13.1, the no-second-publish-step requirement, and corresponding acceptance criteria. Apply this revised meaning to Calendar Intake; do not introduce automatic publication as a side effect of approval.

For a new event, the workflow is candidate review, approval to keep, editorial polishing, then explicit publication. For an update to an already published event, keep proposed changes separate from the public version until the explicit publication action. The precise storage and UI for staged updates remain an implementation design decision.

## Publication completeness

An event with time TBD is editorially incomplete and must not be published to the public calendar. Retain incomplete findings for review rather than inventing a time.

Manually entered and ingested Events use the same NRCS editorial workflow and publication validation. Fields currently mandatory for creating an NRCS Event become optional for drafts and remain mandatory for publication. Do not introduce ingestion-specific completeness rules or bypass the normal publication requirements.

The current form requires title, start time, location name, street address, city, state, and ZIP. Preserve those publication requirements while allowing incomplete drafts, including missing address fields or start time. Apply the distinction consistently in forms, server validation, and database constraints; missing facts must not be replaced with invented defaults. Do not treat time TBD as all-day.

## Cancellation

Confirmed cancelled events remain visible on the public calendar with a clear cancelled flag. A disappearance signal alone is not a confirmed cancellation. Retain the specification's human review requirement.

Temporary archival remains distinct from cancellation. Restoring any archived Event, including a temporarily archived Event, always requires explicit human approval. Source reappearance or any other automated finding must never restore it automatically.

## Scan horizon

Use a 90-day future scan horizon for V1. Disappearance detection must be scoped to the successfully covered inventory window and must not interpret events outside that window, failed runs, partial runs, or incomplete pagination as missing events.

## Source configuration

The user supplied seven seed URLs on September 22, 2026. See [seed source assessment](calendar-ingestion-seed-sources.md). Treat them as editable source records, not a hard-coded launch list. The user authorized additional adapters needed for these seeds, with notification of additions.

The NRCS UI must allow adding, editing, disabling, and enabling sources after launch. Preserve the specification's district scope, source configuration/history, and Run Now behavior. Source configuration is authoritative in NRCS, not embedded in Make.com scenarios or provider-specific code.

Provider selection and the monthly provider/AI budget are still pending.

## Remaining engineering work from the initial review

- Allow incomplete drafts across the normal NRCS Event workflow while enforcing existing mandatory fields at publication for both manual and ingested Events.
- Reconcile canonical event timestamps, all-day representation, and CMS time handling without shifting existing event times.
- Add cancellation display and temporary archive synchronization across NRCS and CMS.
- Map conceptual event classes onto existing district-scoped classification terms and enforce disabled-type creation restrictions on the server.
- Add native-town relationships and correct public Town filtering; avoid limiting to the earliest 500 published events before excluding historical events.
- Add a restricted candidate ingestion API, source-run inventory, provenance, occurrence identity, review history, and diffs.
- Reuse existing event-linked Follow-Ups with flag linkage and the specified 24-hour default.
- Make retries and approval actions idempotent, detect editorial changes made since candidate creation, and suppress unchanged rejected findings.

These are review findings and implementation considerations, not claims of completed work.
