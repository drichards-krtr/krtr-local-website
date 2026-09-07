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
- CMS District Configuration owns the district timezone.
- NRCS consumes district timezone and stores Edition air/recording times as UTC from district-local form input.
- Programs can be created, edited, enabled, and disabled in NRCS.
- Programs can have multiple named templates.
- Template edits affect future Editions only.
- The Programs page includes a weekly Editions calendar filtered by date and Program.
- The Edition rundown page uses searchable Story Rundown Copy selection instead of a long dropdown.

## User Action Required

Apply this migration to the NRCS Supabase project:

```text
supabase/nrcs/migrations/20260906000200_phase_4_programs_production.sql
supabase/nrcs/migrations/20260907000100_district_timezone.sql
```

Apply this migration to the CMS Supabase project:

```text
supabase/migrations/20260907000100_district_timezone.sql
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
10. In CMS District Configuration, confirm each district has an IANA timezone such as `America/Chicago`.
11. Create an Edition with a district-local air time and confirm Supabase stores the expected UTC value.
12. Create/edit/disable a Program.
13. Create/edit/disable multiple templates for a Program.
14. Create a future Edition from a selected template and confirm existing Editions are not changed when the template is edited later.
15. Search for a Story with saved Rundown Copy from an Edition and add it to the rundown.
