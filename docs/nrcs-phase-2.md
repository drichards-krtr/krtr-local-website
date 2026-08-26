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
- Assets and Story-Asset relationships for Cloudinary, Mux, storage, and other references.
- Web Output records with publication status separate from Story lifecycle.
- Story-Event many-to-many links.
- Related Story links.

## Permissions

Stories are district-scoped. Contributors can read/write Stories they created. Contributors can read Stories they did not create only when the Story lifecycle is `active`.

Editors and Admins retain the established NRCS role hierarchy and can work across accessible district content.

For other existing district-scoped public-facing objects, Contributors should be limited to their own records plus records public under that object's own status model, such as published calendar events.

## Current UI

NRCS now exposes:

- `/stories`
- `/stories/new`
- `/stories/[id]`

The Story Editor includes overview, facts/notes, Web/Rundown/Social copy stream saves, review flags, sources, assets, linked events, and related stories.

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
