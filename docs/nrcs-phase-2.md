# NRCS Phase 2 Story Foundation

This phase completes the Story/editorial foundation that was deferred while the Community Calendar work was handled first.

## Implemented Scope

- Canonical NRCS Story records with lifecycle states: `idea`, `reporting`, `ready`, `active`, `dormant`, `closed`.
- Facts & Reporting Notes records attached to Stories.
- One MVP Copy Stream per Story for each stream type: `web`, `rundown`, and `social`.
- Immutable Copy Versions. Saving copy creates a new version row and advances the stream pointer.
- Information-change acknowledgement. If a saved stream changes underlying information, the other copy streams are flagged for review.
- Story Review Flags with open/resolved state.
- Canonical NRCS categories, tags, and tag aliases.
- Sources and Story-Source relationships.
- Source document metadata for a private `source-documents` Supabase Storage bucket.
- Assets and Story-Asset relationships for Cloudinary images/graphics, Mux videos, storage, and other references.
- Web Output records with publication status separate from Story lifecycle.
- Story-Event many-to-many links.
- Related Story links.
- NRCS category/tag management UI.
- Private source document upload and protected signed-download flow.
- Story-level category/tag assignment.
- Web Output editor fields for slug, status, schedule/publish timestamps, SEO fields, and exact Web Copy version selection.
- Tabbed Story Editor flow, with the Open Review Flags tab called out when unresolved review flags exist.
- Cloudinary Media Library picker for Story image/graphic selection.
- NRCS Mux direct upload flow and Mux library picker for Story videos.

## Permissions

Stories are district-scoped. Contributors can read/write Stories they created. Contributors can read Stories they did not create only when the Story lifecycle is `active`.

Editors and Admins retain the established NRCS role hierarchy and can work across accessible district content.

For other existing district-scoped public-facing objects, Contributors should be limited to their own records plus records public under that object's own status model, such as published calendar events.

The Phase 2 contributor visibility migration tightens NRCS Events to that rule: Contributors can read their own events
and published district events; Editors/Admins can read accessible district events.

Cloudinary image/graphic assets use one common NRCS-accessible pool to avoid duplicate shared art and logos. Mux video assets remain access-controlled in NRCS metadata: Contributors can see/select only their own uploaded video assets, while Editors/Admins retain broader access through the role hierarchy and district checks.

## Current UI

NRCS now exposes:

- `/stories`
- `/stories/new`
- `/stories/[id]`

The Story Editor includes overview, facts/notes, Web/Rundown/Social copy stream saves, review flags, sources, assets, linked events, and related stories.
The Taxonomy page is available to Editors/Admins at `/taxonomy`.

Story image/graphic selection uses the Cloudinary Media Library widget. Story video upload uses Mux direct uploads; existing video selection uses an NRCS Mux Library popover with title/category/tag search, thumbnails when available, a current-district default, an all-district toggle, and non-selectable processing videos. Mux status can be refreshed from the Story asset list until webhook automation is added.

Source documents are intentionally attached under Sources through the private `source-documents` bucket. They are not part of the general Cloudinary/Mux asset picker.

## Rich Text Rule

TipTap with server-side sanitized HTML is the NRCS rich-text standard.

NRCS rich-text fields should store sanitized HTML, not Markdown. This supersedes the original engineering specification's
Markdown-backed editor language.

Cross-system publication contracts must account for this explicitly:

- NRCS should send sanitized HTML fields to CMS for Story/Event display.
- CMS should render NRCS-originated HTML with an allowlist/sanitization boundary rather than passing arbitrary HTML through.
- Existing CMS Markdown content remains a legacy/migration concern; migration should convert or preserve it intentionally.
- API payloads should name rich text fields clearly, such as `body_html`, instead of overloading `description` or `body_markdown`.
- Any plain-text summaries/search snippets should be derived server-side from sanitized HTML.

## USER ACTION REQUIRED

USER ACTION REQUIRED — Supabase Storage
Where: NRCS Supabase project → Storage
Action: Create a private bucket for source documents.
Value: Bucket name `source-documents`; public bucket setting disabled/private.
Return to Codex: No secret required. Tell Codex when the bucket exists.
Verify: In Supabase Storage, the bucket appears as `source-documents` and is not public.

USER ACTION REQUIRED — NRCS Supabase SQL
Where: NRCS Supabase project → SQL Editor
Action: Apply the new Phase 2 migrations.
Value: `supabase/nrcs/migrations/20260826000300_phase_2_story_foundation.sql`, `supabase/nrcs/migrations/20260826000400_phase_2_contributor_visibility.sql`, and `supabase/nrcs/migrations/20260826000500_phase_2_asset_media_fields.sql`
Return to Codex: Tell Codex whether all migrations applied cleanly.
Verify: NRCS Supabase contains `nrcs_stories`, `nrcs_copy_streams`, `nrcs_copy_versions`, `nrcs_sources`, `nrcs_assets`, `nrcs_asset_tags`, `nrcs_web_outputs`, and the `NRCS events role read` policy.

USER ACTION REQUIRED — NRCS Cloudinary Environment
Where: NRCS Vercel project → Environment Variables
Action: Add Cloudinary configuration for the Media Library widget.
Values: `CLOUDINARY_CLOUD_NAME`; `CLOUDINARY_API_KEY` is optional but recommended for Cloudinary product-environment validation.
Verify: The Story asset tab can open the Cloudinary library and attach a selected image/graphic.

USER ACTION REQUIRED — NRCS Mux Environment
Where: NRCS Vercel project → Environment Variables
Action: Add Mux credentials for direct upload and library status refresh.
Values: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`
Verify: The Story asset tab can create a video upload, upload a file to Mux, refresh status, and select ready videos from the Mux Library popover.
