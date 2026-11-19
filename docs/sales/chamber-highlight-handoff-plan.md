# Chamber Event Highlight handoff — added scope

## Authorization and placement

Dan added this feature to the Sales project on November 18, 2026, while between
Chunks 4 and 5. The request is to include and schedule the handoff; implementation
does not need to start now. Imperative build/deployment instructions in the
attached handoff prompt are future requirements, not instructions to execute the
feature or disable existing administration during this planning task.

Implement as **Chunk 6B**, after the website integration work in Chunk 6 and before
NRCS fulfillment in Chunk 7. This groups the Sales/CMS connection, calendar cache
checks and coordinated handoff ahead of the larger NRCS fulfillment integration.
No Stripe dependency is required. Existing billing stays separate: no Chamber
catalogue SKU, price, term, invoice automation or commission rule is inferred.

Source attachment: `C:/Users/Dan/Downloads/chamber-highlight-codex-prompt.md`.
The repository already contains a more complete retained handoff prompt at
[chamber-highlight-codex-prompt.md](./chamber-highlight-codex-prompt.md), including
the staged retirement procedure. Retain both that contract and
[Chamber operations](../chamber-highlight-operations.md) as implementation inputs.

## Existing ownership and integration boundary

- CMS remains authoritative for `chamber_accounts` and
  `chamber_district_coverage`. Preserve existing UUIDs and the composite coverage
  identity `(chamber_id, district_key)`; do not copy these authoritative records
  into the Sales Supabase project.
- Sales becomes the authorized administration interface: list, create, edit,
  account activation, contact details/notes and independent district coverage.
- All reads/writes use the existing server-to-server CMS endpoint
  `app/api/nrcs/chambers/route.ts`: GET returns accounts/coverage/districts; POST
  accepts the full account and coverage map and returns `id, affected_districts`.
- NRCS continues editing, assigning/removing and publishing event highlights.
  The event's `chamber_id` and `chamber_highlight_type` remain in the existing
  event workflow. The two supported types are `chamber_hosted` and `chamber_member`.
- Public rendering keeps its event-level gold borders and labels, resolved by
  the existing CMS `chamber_event_label(events)` function. This is separate from
  Community Calendar banner sponsorship and coverage sponsorship products.

## Implementation sequence and decisions

1. Recheck the live API, Sales authentication/role helpers, NRCS integration and
   canonical CMS host. Existing NRCS release notes name `https://www.krtrlocal.tv`;
   confirm deployed publishing configuration for each environment rather than
   assuming the apex host or adding `/cms` or `/api` to the base URL.
2. Confirm the administrator permission policy before implementing access.
   Recommended direction is owner access plus appropriately scoped district/
   regional managers; ordinary salespeople, customers and production identities
   must not inherit Chamber administration just from general workspace access.
   Whether any additional staff role should administer is an explicit decision.
3. Design reads and writes for shared multi-district accounts. The current CMS
   bearer grants full admin API access, not caller-specific Sales permissions.
   Enforce authorization on every Sales server read/action, filter private results
   before returning them, and require authority over every district affected by
   shared name/contact/account-status edits. Cross-region/global changes require
   the owner or equivalent complete authority under the confirmed policy.
4. Use district keys returned by the CMS API and explicitly map them to Sales
   scopes. `dlpc` exists in both systems; CMS can also contain districts not yet
   configured in Sales. Do not silently grant access or manufacture Sales district
   records. Unmapped districts require owner handling until mapping is configured.
5. Preserve out-of-scope coverage on saves. POST is a full coverage replacement:
   omitted previous districts become inactive and remain retained. A manager's
   filtered form must not disable hidden districts. Re-read/validate the full
   record before saving, merge only authorized changes, and address overlapping
   edits so a stale full-map save cannot silently undo another administrator.
   If the current API cannot provide the needed concurrency/scope guarantees,
   extend its contract deliberately rather than claiming that a filtered UI is
   sufficient protection.
6. Build Sales list/create/edit/status/contact/coverage screens using existing UI
   conventions. Names need not be unique. Generate one UUID per new-account intent
   and retain it across failures/retries. Require name, city, explicit active status
   and known district keys; allow empty contacts/notes. Show actionable API errors.
7. Configure separate server-only Sales base URL and dedicated bearer variables,
   with the matching CMS secret named `CMS_SALES_CHAMBER_API_SECRET`. Use a random
   dedicated credential; do not reuse the NRCS publication credential or expose
   keys in browser code, logs or source. Final Sales variable names are chosen and
   documented during implementation. No credentials are provisioned by this plan.
8. Disable caching of private administration responses, enforce fetch timeouts,
   and reject authenticated redirects. Keep all saves on the CMS API path so its
   atomic save and `lib/publicCache.ts` invalidation remain in effect, including
   the root/global fallback for DLPC. Do not write directly to CMS tables from Sales.

## Verification and cutover gates

Keep the temporary NRCS administration interface working throughout implementation
and Sales deployment verification. Preserve accounts, coverage rows and event IDs.

Test authentication and role scope on reads and writes, malformed/unknown district
keys, independently active districts, repeated display names, stable UUID retries,
full-map preservation, overlapping edits and API timeout/error/redirect behavior.
Private contacts and notes must not leak into public responses or unauthorized
Sales views.

In a test environment, create and edit an account from Sales; read the same record
in NRCS; assign/publish a test event with each highlight type. Check public calendar
listing/grid/detail after rename and after account/coverage activation changes in
each district. Verify cache refresh, including DLPC's root fallback, and removal
of an event highlight through the normal NRCS editor. Record actual evidence.

Only after the Sales implementation is deployed and verified, present the concrete
cutover result to Dan and request explicit approval. The current scope addition is
not that retirement approval. Once approved:

1. Set `NRCS_CHAMBER_ADMIN_ENABLED=false` on both NRCS and public/CMS deployments
   and redeploy the affected applications.
2. Verify NRCS navigation, admin page/action and NRCS-token admin GET/POST are
   disabled. Sales administration must still work through its dedicated credential.
3. Verify NRCS catalog GET (`?view=catalog`) remains available to the NRCS service
   token, and editors can still assign/remove/publish highlights normally.
4. Recheck Sales writes, public cache refresh and record identity preservation.
   Retain the flag-based rollback procedure in the operations documentation.

These coordinated releases are intentional Chamber changes, not permission to
broaden normal monorepo deployment triggers. Keep unrelated app changes isolated.
Include a final Chamber regression in Chunk 10 launch verification.

## Current state

Planning only. No Chamber application code, database records, secrets, deployment
settings or retirement flags were changed as part of adding this scope.
