# NRCS Phase 4 - Programs, Editions, Rundowns

Phase 4 adds NRCS-only program production surfaces. CMS and public KRTRLocal.TV behavior are not changed in this phase.

## Implemented Scope

- District-scoped programs seeded per district:
  - Morning Kickstart
  - Noon Nugget
  - Evening Recap
- District-scoped program templates seeded for each program:
  - Intro
  - Weather
  - Sports Scores
  - Upcoming Sports
  - Break
  - Outro
- Editions require a scheduled air date/time and support an optional recording date/time.
- Default edition titles use `{Program Name} - {Local Date}` when no title is supplied.
- Rundown item types are:
  - Story Item
  - Segment Item
  - Script Item
  - Production Note
- Story Items can only attach existing Story `rundown` copy versions.
- Script view renders continuous spoken copy and excludes production notes.
- Carry To Tomorrow can reuse the same copy version or create a new copy version before carrying forward.
- Programs, Editions, and Rundowns require editor/admin access.
- The dashboard shows the next upcoming edition for each program with a scheduled future edition.

## User Action Required

Apply this migration to the NRCS Supabase project:

```text
supabase/nrcs/migrations/20260906000200_phase_4_programs_production.sql
```

No new Vercel environment variables are required for this phase.

## Verification

After deployment:

1. Open NRCS as an editor/admin.
2. Confirm `Programs` appears in the sidebar.
3. Create an edition for each seeded program.
4. Confirm default template items appear in the new rundown.
5. Add a Story Item using a Story Rundown Copy version.
6. Add Segment, Script, and Production Note items.
7. Use Script View and confirm production notes are excluded.
8. Use Carry To Tomorrow from a Story Item and confirm the target edition is created or reused.
9. Confirm contributors cannot access `/programs` or `/editions/{id}`.
