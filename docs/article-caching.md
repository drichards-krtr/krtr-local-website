# Article output caching (part one)

Public `/stories/:id` URLs rewrite to a host-scoped ISR route. Published article
HTML, RSC output and metadata persist until the district article tag is expired.
The root host has its own output and canonical URL, backed by the DLPC district.
Direct requests to the internal route return 404. Staff routes stay dynamic.

Successful NRCS web deliveries expire the district tag, including replays and
status-recovery requests. This covers current slugs, historical aliases, ID
redirects and negative results. CMS saves, withdrawals and Mux updates also
expire the tag. District-wide invalidation favors correctness over retaining
unaffected articles after an editorial update.

Missing and scheduled stories do not enter the indefinite data cache. Their
negative page output revalidates after 60 seconds. The next request triggers
regeneration, so scheduled visibility can lag that interval plus regeneration;
it does not require a cron or another editorial save.

Article chrome (header settings, footer, weather and alerts) loads separately
with a 60-second route cache. Open tabs poll once per minute while visible.
Changes can therefore take approximately two minutes plus regeneration to
appear. This is not an instant emergency push channel. Ad selection and tracking
use a separate uncached POST, once per article mount; rendering and prefetching
cached article HTML never record impressions. Article content is in initial HTML.

## Verification

`tests/article-cache.cjs` starts an isolated PostgREST fixture and production
Next server. It checks output cache hits without story database reads, district
and root isolation, spoofed headers, endpoint authentication, actual NRCS
delivery invalidation, corrections, slug/ID redirects, withdrawals, scheduled
visibility, live chrome and ad impressions. It never connects to production data.

Build first with these test-only environment values, then run the test:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54399'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='fixture-anon-key'
$env:SUPABASE_SERVICE_ROLE_KEY='fixture-service-key'
npm run build
node tests/article-cache.cjs
```

Use normal production environment values for hosted builds. Never deploy a local
fixture build. No new production environment variables or database migrations
are required.

### November 15 verification status

- Production-mode webpack compilation and Next.js TypeScript checks passed.
- Full production build passed using an isolated output folder, a mocked Google
  font response, and a test-only Windows directory-creation workaround. None of
  these workarounds changes production configuration or is included in deployment.
- Next.js classified the article route as static output.
- `node tests/phase7-publications.cjs` passed.
- The integration test could start its servers, but this host denied Node's
  loopback connection with `EACCES 127.0.0.1:3100`. Its behavioral assertions have
  not passed; cache hits and the complete publication flow still need verification.
- Vercel rejected preview creation with `402 resource_creation_blocked` because
  the team exceeded fair-use limits. No preview or production release occurred.
- The connected GitHub repository reports `push: false`; changes remain local.

## Hosted release checks

Build from the changed source in the existing website project. Repeated public
article requests should report cache hits; confirm district branding, metadata,
ads and live chrome. Publish an approved correction through NRCS and verify the
next public request reflects it. Do not fabricate or withdraw a live news story
solely for a test. Preserve the previous production deployment for rollback.

On November 16, production article HITs and an NRCS correction were verified on
both district and main-site URLs: the updated article returned REVALIDATED,
followed by HIT with identical updated content. Phase-two implementation and
release status are documented in `public-page-caching.md`.
