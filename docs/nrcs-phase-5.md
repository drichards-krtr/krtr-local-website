# NRCS Phase 5 - Graphics & Asset Production

## Scope and Decisions

- User workflow override (September 17, 2026): work on the current branch without creating new branches, regardless of the engineering specification. Never push commits; the user handles pushes and deployment.
- Generic, Sports, and Weather builders reuse the original local HTML/canvas rendering functions.
- Protected Next.js pages host the builders. NRCS auth and RLS govern saving and contextual attachment.
- Download PNG works independently of Cloudinary and the NRCS database.
- Save to Cloudinary uses a server-side signed upload, then an atomic database transaction for Asset, Tags, and attachment.
- Asset title is required; district category and canonical tags are optional.
- Images/graphics remain shared assets, not district-owned. The selected district is recorded as origin metadata; Story/Edition attachments retain district relationships.
- Shared School and Co-op identities have district selections and one optional default per district.
- DLPC initially selects the original identities and defaults to Union Knights.
- Contributors may generate/save graphics globally or for their own Stories. Edition/Segment access and identity management require editor/admin.
- Story-context generation attaches to Story Assets.
- Edition/Segment-context generation attaches to Edition Graphics, retaining the Segment relationship when applicable.
- Homepage Daily placement remains Phase 6. Phase 5 does not publish or change the public site.
- Original co-op artwork is retained. Create Co-op generates a logo automatically; Regenerate Logo is explicit. Changing the referenced schools generates a new logo.
- Co-op recipes record primary/partner identities, source logo references, and normalized partner placement in the lower-left quarter.
- New school logos must be transparent PNGs selected/uploaded with the Cloudinary Media Library.
- Legacy artwork remains available from bundled originals until explicitly imported to Cloudinary. JPEG legacy artwork is converted losslessly from its decoded pixels to PNG on import.
- Waterloo East, Waterloo West, and Waterloo United filenames do not supply mascot metadata. Their legacy mascot values remain blank pending user confirmation; staff must supply a mascot when editing. Original display labels/logos continue to work.

## Asynchronous Check

- Canvas draws are serialized so overlapping image loads do not interleave partial canvases.
- Capture waits for rendering and uses PNG Blob encoding.
- Client captures, uploads, and database saves show preparing/saving/success/failure states and block duplicate saves.
- Failed NRCS registration rolls back Asset/Tag/context writes together.
- Retry Save retains its original image, metadata, and request ID. Cloudinary public IDs are user/request-bound and never overwrite existing uploads.
- School saves, district selections, legacy imports, and co-op regeneration use asynchronous requests with progress/error states.
- Weather icons use an authenticated same-origin image endpoint with an allowlist, timeout, and private browser cache.
- Existing CMS behavior is unchanged. No CMS migration or service contract is introduced.

## USER ACTION REQUIRED - NRCS Supabase

Status: User confirmed the migration applied successfully without errors on September 17, 2026.

Where: Supabase Dashboard > NRCS project > SQL Editor > New query.
Confirm this is the NRCS project, not CMS.
Action: Apply `supabase/nrcs/migrations/20260916000100_phase_5_graphics.sql`.
Value: The complete file, after Phase 1-4 NRCS migrations.
Return: Confirm success or the exact SQL error. Do not send database keys.
Verify: Tables `nrcs_school_identities`, `nrcs_district_schools`, and `nrcs_edition_assets` exist. DLPC default joins to Union Knights.
Optional: `supabase/nrcs/tests/phase5_graphics_permissions.sql` tests contributor/editor/anonymous behavior, duplicate retry, cross-Edition attachment denial, and atomic save rollback. Its fixtures are rolled back. It has not been run against production by Codex.

## USER ACTION REQUIRED - NRCS Vercel

Status: User confirmed all required environment variables are present on September 17, 2026.

Where: Vercel > NRCS project > Settings > Environment Variables.
Action: Verify existing server-only Cloudinary configuration is available in Production.
Value: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`; alternatively `CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME`.
Secrets must never use a NEXT_PUBLIC prefix. Existing widget variables remain compatible.
Return: Confirm configured. Do not paste secrets here.
Verify: After user deployment, Save to Cloudinary succeeds. Downloads do not need these values.
No new CMS variables, DNS changes, or Mux configuration are required.

## USER ACTION REQUIRED - Deployment and Logo Import

Where: User Git workflow and NRCS production.
Action: Push/deploy `main` using the user's normal workflow after the requested local Phase 5 commit and merge. Codex does not push commits. Production testing remains pending deployment.
After deploying, open Schools & Co-ops > DLPC and select Import Original Logos to Cloudinary.
Return: Confirm import/save success or exact displayed errors.
Verify: Logos appear in the shared Cloudinary library, selected school rows have Cloudinary previews, and Sports PNGs download/save with logos.
Import is rerunnable for remaining identities and preserves prebuilt co-op pixels; it does not regenerate them.

## Verification

Local checks:
- NRCS TypeScript and production build.
- Original vs ported pixel hashes for Generic/Sports/Weather at 1080x1920, 1920x1080, 1080x1160.
- PNG capture/download and iframe message delivery.
- Desktop/mobile generator screenshots and horizontal overflow checks.
- Co-op PNG composition and unchanged top half.
- Cloudinary config parsing/signature construction and injected-label script escaping.
- Browser weather-icon tests use deterministic mock images for parity. Actual NWS retrieval and live Cloudinary/database integration require production verification.
- SQL permission checks are supplied but not executed locally; no local PostgreSQL or production credentials were used.

Production checklist:
1. All three Graphics builders preview, Download PNG, and Save to Cloudinary.
2. Save requires an asset title; optional category/tags persist on the saved asset.
3. Generate from a Story Assets link, return to Story, open Assets, and confirm the graphic/preview.
4. Generate from an Edition and a Segment link; return and confirm Edition Graphics shows the right context.
5. Global generation creates an unattached, searchable shared Graphic Asset.
6. A simulated failed save can retry its original image without duplicate Cloudinary upload or asset/attachment rows.
7. Shared schools/co-ops can be created/edited; newly created school logos reject opaque or non-PNG files.
8. Each district has independent school selections and default. DLPC starts at Union Knights.
9. New co-op generation and explicit regeneration save a PNG and recipe. Existing co-op artwork stays unchanged until requested.
10. Contributor can generate for own Story, cannot attach to another Story or open Editions/Schools manager.
11. Anonymous/inactive requests cannot use graphics save, schools, or weather-icon endpoints.
12. Weather previews use actual NWS icons in production; unavailable icons display the original fallback.
13. Existing public/CMS/Event/Story/rundown behavior remains intact.

## Rollback

Revert the Phase 5 application changes and redeploy. Keep the additive tables/asset records and Cloudinary uploads.
Do not delete generated assets or migration tables as part of application rollback.
The migration also restricts the existing shared-image read policy to active staff; retain that restriction.
