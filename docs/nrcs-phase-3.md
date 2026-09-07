# NRCS Phase 3 Workflow and Retrieval

This phase adds the newsroom workflow and retrieval layer on top of the Phase 1/2 NRCS foundation.

## Implemented Scope

- Follow-Ups with `open`, `in_progress`, `completed`, and `canceled` statuses.
- Follow-Up due dates require a date. If no time is entered, NRCS defaults the due time to 5:00 PM local time.
- Follow-Up activity logs with timestamped notes.
- Intentional backdating for Follow-Up notes is available only to Editors/Admins.
- Contextual Follow-Ups for Stories and Events.
- Standalone Follow-Ups from the Dashboard and Follow-Ups page.
- Story Wakes with retained history.
- Story Wakes do not change Story lifecycle state.
- One active Wake per Story. Creating a new Wake closes any prior active Wake for that Story.
- Triggered Wakes appear on the Dashboard with Open, Snooze, Activate, and Close actions.
- Story pages show a future Wake indicator and Wake controls.
- Recently Opened tracking per user.
- Global Search across Stories, Facts, Copy Versions, Events, Assets, Sources, Tags/Aliases, and Categories.
- Zero-query Search view shows Recently Opened and Recently Updated.
- Dashboard triage sections: Needs Attention, Today, Upcoming, Recent Work, Recently Opened, and Intake.
- Intake queue for public Story Tips and public Community Calendar submissions.
- Public Story Tips and Calendar submissions now forward to NRCS intake immediately.
- Public Calendar submissions no longer create CMS draft Events.
- Intake conversion actions:
  - Story Tip -> NRCS Story in `idea` lifecycle state.
  - Calendar Submission -> NRCS draft Event, followed by the existing Event sync path to CMS.

## Permissions

Follow-Ups are district-scoped. Contributors can read Follow-Ups they created and Follow-Ups attached to objects they can read. Editors/Admins can manage Follow-Ups across districts they can access.

Story Wakes use Story permissions. A user must be able to read the Story to see its Wakes and must be able to write the Story to create, snooze, activate, or close Wakes.

Intake queues are Editor/Admin-managed because public submissions can include contact information and unpublished leads.

Recently Opened records are per-user.

## Integration Boundary

CMS/public still owns the public submission forms, but public Story Tip and Calendar submission data is sent to NRCS through `POST /api/intake` on the NRCS app.

The request is authenticated with the existing shared CMS/NRCS secret pair:

- CMS/public sends `CMS_NRCS_API_SECRET`.
- NRCS validates against `NRCS_CMS_API_SECRET`.

No app directly queries the other app's Supabase database.

## USER ACTION REQUIRED

USER ACTION REQUIRED - NRCS Supabase SQL
Where: NRCS Supabase project -> SQL Editor
Action: Apply the Phase 3 migration.
Value: `supabase/nrcs/migrations/20260906000100_phase_3_workflow_retrieval.sql`
Return to Codex: Tell Codex whether it applied cleanly.
Verify: NRCS Supabase contains `nrcs_follow_ups`, `nrcs_follow_up_activity_logs`, `nrcs_story_wakes`, `nrcs_story_wake_history`, `nrcs_recent_items`, and `nrcs_intake_items`.

USER ACTION REQUIRED - CMS/Public Vercel Environment
Where: KRTRLocal.TV/CMS Vercel project -> Environment Variables
Action: Add the NRCS intake base URL.
Value: `CMS_NRCS_API_BASE_URL=https://nrcs.krtrlocal.tv`
Return to Codex: No secret value needed. Tell Codex when it is set and redeployed.
Verify: Public Story Tip and Calendar submission forms submit successfully and a matching item appears in NRCS -> Intake.

USER ACTION REQUIRED - Shared API Secret Check
Where: Both Vercel projects -> Environment Variables
Action: Confirm the existing shared secret values still match.
Expected values:
- CMS/Public project has `CMS_NRCS_API_SECRET`
- NRCS project has `NRCS_CMS_API_SECRET`
- The two values are identical.
Return to Codex: Do not paste the secret. Tell Codex whether they match.
Verify: Submitting a public Story Tip or Calendar item does not return `Unauthorized`.
