# Public output caching: phase two

## Routes

Host-scoped rewrites serve saved HTML and RSC output through
`/public-cache/[scope]/[view]/[[...parts]]`. The internal path is inaccessible
directly. District routing uses the host; client-supplied district headers cannot
select another cache. The root site retains its existing DLPC content fallback
with its own output and canonical URL.

| Content | Lifetime |
| --- | --- |
| About, Advertise, Terms/Privacy, Festival of Trails, VOTE information | Until CMS update or deployment |
| Homepage, category listings, calendar, garage listings, Daily videos | Invalidate after an update, with a 60-second ISR fallback |
| Weather and Watch Live pages | 60-second ISR fallback and relevant editor invalidation |
| Shared header/footer/settings/weather/alert bar | Separate tagged 60-second cache; visible tabs poll each minute |
| Articles | Phase-one indefinite output cache; publication invalidation retained |
| Submissions, nominations, voting forms, staff/API routes | Dynamic |

The fallback handles scheduled releases, alert start/end times, event expiry,
midnight Daily selection, seasonal navigation and nomination/voting windows.
ISR is demand-driven: after expiry the next visit triggers regeneration and may
receive the previous output while that completes. This is not a cron or an
instant push mechanism. NWS data retains its upstream refresh policy.

Calendar queries and garage-sale dates are encoded into separate internal paths.
Calendar repeated parameters retain order (including checkbox last-value
semantics). Tracking parameters do not create more cache variants. Oversized
filters use the original dynamic route. Forms and mutation POSTs retain their
original destinations.

Page regeneration reads current database records instead of preserving untagged
database responses underneath the output cache. All cached views include a tag
dependency used by publication invalidation.

## Publishing and editor updates

- Successful NRCS Web, homepage, alert and Daily deliveries invalidate their
  district's public pages and shared chrome. Replays and status recovery can
  repair missed invalidation. DLPC changes also expire the root-site fallback.
- Successful NRCS event publication and withdrawal invalidate calendar output.
- Existing CMS server-action path invalidations also expire public output and
  chrome across districts. This conservative scope covers seasonal pages,
  settings, classification/visibility edits, logos, social links and stream config.
- Browser Story/Daily saves use the authenticated recovery endpoint, including
  the previous district if a record moves. The story editor refreshes after its
  final Hero/Top Stories slot write to avoid caching an intermediate lineup.
- Mux callbacks and staff Daily sync invalidate relevant output. Public Daily
  requests no longer perform Mux synchronization writes during rendering.
- The existing service/admin-authenticated `/api/cms/article-cache` endpoint can
  recover both article and public page caches for a district.

Ad rotation and impressions use an uncached per-visit POST. Homepage ads load in
the three-ad position after the content; other pages request only the applicable
placements. Building, generating, caching and prefetching public HTML record no
ad impressions. No new environment variables, cron jobs or migrations are needed.

## Validation and release

Run `node tests/public-cache.cjs` and `node tests/phase7-publications.cjs` for
routing, query isolation, district selection, form exclusions, successful/failed
delivery invalidation and ad-placement checks. `tests/article-cache.cjs` also
includes production-server assertions for homepage hits, calendar filter
isolation and article-publication refresh of the homepage. That test requires
the isolated fixture build described in `article-caching.md` and loopback access.

After pushing, verify cache HITs for homepage, categories, calendar (two filter
variants), informational and Daily pages. Then re-deliver a homepage lineup or
approved alert and verify updated output followed by HITs, just as phase one's
article update was verified. Confirm advertisements and forms in a browser.
Keep the phase-one deployment available for rollback.

### November 16 local results

- Production webpack build and Next.js TypeScript checks passed, using only
  test-local font and Windows directory-creation workarounds. Temporary build
  configuration and generated type paths were removed afterward.
- Next.js classified the new public route as static output.
- Routing, query isolation, host-spoof resistance, form exclusions, cache-tag
  scope, time-based fallback, ad placement, and event delivery tests passed.
- Existing publication contract tests passed, including assertions that Web,
  homepage and alert receipts refresh public pages only in live publishing mode.
- Production-server integration remains unverified locally: the environment
  denied its loopback connection (`EACCES 127.0.0.1:3100`).
- No phase-two deployment occurred. The GitHub connection reports `push: false`.
