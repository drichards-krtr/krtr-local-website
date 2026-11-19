# NRCS Assignment Desk

Assignment Desk and Radar are adjacent in the newsroom navigation. A Radar entry can seed a district pitch while staying on Radar. A producer, editor, or admin can archive the original when it no longer needs monitoring. Archived entries remain visible in the Archived view.

Producers and above can choose Skip, Hold, Need More Info, or Assign. Assign requires an active owner with district access and creates one linked story in Reporting, with the pitch details in Story Facts. The linked story follows the ordinary NRCS editorial workflow.

The Assignment Desk lists pitches oldest first. Assigning a pitch moves it to the Archived view, where its linked draft remains accessible. Workbook pitches labeled Previously approved also appear in Archived.

## Newsroom Jack cutover

After the NRCS deployment, submit new pitches in Assignment Desk. Review the linked story after an assignment is approved. Use Radar for developing leads that need monitoring. Historical workbook decisions are visible in the desk. Prior approvals are labeled Previously approved and preserve the original notes.

For programmatic intake, use `POST /api/assignment-desk` with a signed-in NRCS session or a valid Supabase access token for the worker's active NRCS staff account. The JSON body accepts `district_key`, `title`, and `details`. The response includes the pitch `id` and `decision`. Use `GET /api/assignment-desk?district=dlpc&offset=0` to check decisions and linked story IDs in pages of 50. Keep the worker's access scoped to the districts it covers.

Before submitting a pitch, check the district desk for an existing entry on the same story. Save the returned pitch ID and check its decision on subsequent runs. When the decision is `assigned` and `story_id` is present, open that story in Reporting and continue the regular editorial workflow there. The Assign action creates the draft automatically. For `need_more_info`, use the decision note to guide follow-up reporting. `pending` and `hold` stay on the desk, and `skip` closes the pitch for the worker. Historical decisions remain available for reference.

## Workbook import

Apply the Assignment Desk migration before importing history. To reproduce the one-time import, run:

```powershell
python scripts/import-assignment-desk.py 'Assignment Desk.xlsm' 'assignment-history.sql'
```

Run the generated SQL on the NRCS database. Keep the generated SQL and workbook out of Git because they contain internal reporting notes. The importer preserves source rows and editorial notes, omits the labeled example row, and uses stable keys to prevent duplicate imports. It leaves existing NRCS stories and Radar archive status untouched.
