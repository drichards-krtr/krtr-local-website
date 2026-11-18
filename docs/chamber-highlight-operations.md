# Chamber Event Highlight operations

Chamber accounts and per-district sponsorships live in the CMS Supabase project. NRCS keeps the event assignment in its own database and publishes it to the same public event row using the existing event delivery API. The calendar database query resolves the label against current coverage and returns only the public label. Existing calendar output caching and district routing remain in use.

## Release order

1. Apply `supabase/migrations/20261118000100_chamber_highlights.sql` to CMS Supabase and `supabase/nrcs/migrations/20261118000100_chamber_highlights.sql` to NRCS Supabase. The older deployed apps can keep using the existing RPCs and event fields.
2. Deploy the public/CMS project before NRCS. The NRCS editor and admin page use the existing NRCS-to-CMS base URL and server credential for the Chamber catalog and management API.
3. Open **Admin → Chamber Sponsorships** in NRCS as an administrator. Confirm the La Porte City Chamber of Commerce account is active with active coverage for `dlpc`, displayed as Dysart-La Porte City. If needed in a new environment, create that account with city `La Porte City, Iowa` and leave the contact fields blank. Billing is handled separately.
4. Open an eligible event in NRCS, choose the highlight type and Chamber, then save or publish through the ordinary workflow. Confirm the CMS delivery receipt and the calendar listing, calendar-grid item and selected-event detail. For a published event, removing the assignment and saving should restore default presentation.

## API and cache behavior

The dedicated Sales Portal bearer token and existing NRCS service token are checked on the CMS server. The CMS database RPC atomically saves the account and coverage. Account rename and status changes refresh all covered district scopes. Existing coverage rows are retained on deactivation so the same save can safely be retried and the affected caches refreshed again. The current 60-second ISR policy is the fallback if invalidation fails. A successful event delivery refreshes its current district and its previous district if it moved. DLPC refreshes also expire the root site's fallback. Existing references survive account and coverage deactivation.

For the exact request shapes, database relationships, authorization rules, and staged retirement procedure, use [chamber-highlight-codex-prompt.md](./sales/chamber-highlight-codex-prompt.md). After Sales Portal verification and explicit approval, set `NRCS_CHAMBER_ADMIN_ENABLED=false` on both public/CMS and NRCS Vercel projects and redeploy. Roll back retirement by reverting the flag on both projects and redeploying if administrative access must return to NRCS.
