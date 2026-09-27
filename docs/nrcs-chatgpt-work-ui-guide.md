# KRTR NRCS UI Guide for ChatGPT Work Agents

This guide describes how to use the current KRTR Newsroom Computer System (NRCS) user interface to draft and edit Stories, Events, Program Editions/Rundowns, and graphics. It is an operating guide for an authenticated ChatGPT Work agent, not authorization to publish or remove content.

## 1. Operating Rules

1. Use only the district named in the assignment. Do not change a record's district to make it visible or selectable.
2. Treat **drafting** and **publishing** as separate actions. A Producer can complete assigned editorial work without repeated approval, but cannot schedule or publish Web/Social outputs.
3. Do not archive, delete, or remove records. The Producer role intentionally does not expose those destructive actions.
4. Do not alter Programs, Templates, Taxonomy, Event Classes, Schools, Users, or district configuration unless the assignment specifically calls for administrative work.
5. NRCS forms do not generally autosave. Use the relevant **Save** button and wait for the green success message or updated version number before leaving a page.
6. A page refresh after a save is normal. A success message confirms the NRCS save. For an Event, also inspect the separate CMS delivery result.
7. Do not retry a save merely because the page refreshed. First check for the success message and verify the saved values.
8. Preserve supplied wording, attribution, dates, times, locations, and links. Do not invent missing facts.
9. Report errors exactly as displayed, including the page, record title, operation, and error text.

## 2. Access and Roles

Sign in at the production NRCS login page with the credentials provided for the assignment.

The account must be active and assigned to the required district.

| Work | Minimum role |
| --- | --- |
| Create or edit the agent's own Stories and Events | Contributor |
| Create or edit district Stories and Events assigned to the agent | Producer |
| Draft Web/Social outputs without publishing | Producer |
| Create or edit Editions and Rundowns | Producer |
| Create Story or Edition/Rundown graphics | Producer |
| Manage Programs and Templates; schedule/publish outputs | Editor |
| Manage other users or destructive maintenance tools | Admin |

The intended role for an autonomous Work agent is **Producer**. A Producer can work across district editorial records and production Rundowns, but cannot administer Programs/Templates, publish Web/Social outputs, archive Editions or Events, or delete Rundown items. Contributor visibility remains intentionally restricted to owned work and otherwise-visible published/active content.

## 3. NRCS Concepts

### District

Stories, Events, Programs, Editions, Rundowns, and editorial placements belong to a district. Confirm the district selector before creating a record. `DLPC` is a normal current district, not a universal fallback that should be applied to every assignment.

### Story lifecycle versus publication

A Story lifecycle describes newsroom progress:

- `idea`
- `reporting`
- `ready`
- `active`
- `dormant`
- `closed`

Lifecycle is not the same as Web publication status. Web and Social publication instructions are managed separately under **Web Output**.

### Story content areas

- **Overview**: district, lifecycle, title, and category.
- **Facts**: internal facts and reporting notes. This is not the public article body.
- **Copy**: separate Web, Rundown, and Social copy streams.
- **Production**: attach an exact Rundown Copy version to an Edition. Editor only.
- **Workflow**: follow-ups and future-wake handling.
- **Web Output**: Web and Social delivery instructions and selected media.
- **Tags**: canonical NRCS tags.
- **Review Flags**: unresolved warnings that need review. A yellow tab with `!` and a count means flags are open.
- **Sources**: source records and private supporting documents.
- **Assets**: Cloudinary images/graphics, Mux videos, and other Story assets.
- **Links**: related Events and Stories.

### Copy versions

Saving copy creates a new immutable version. A Rundown Story item points to one exact Rundown Copy version; later copy saves do not silently replace the version already in a Rundown.

### Rich text

The editor supports Normal text, Heading 1, Heading 2, Bold, Italic, Link, numbered lists, bullet lists, and blockquotes. Select visible link text before using **Link**, then enter the actual URL. Saved HTML is sanitized by NRCS.

## 4. Draft a New Story

1. Open **Stories** in the sidebar.
2. Select the required district in the list filters and apply it if necessary.
3. Choose **New Story**.
4. Confirm **District**.
5. Leave **Lifecycle** as `idea` unless the assignment specifies another lifecycle.
6. Enter the canonical Story title.
7. Choose **Create Story**.
8. Wait for the Story page and the green saved confirmation.

The new Story is created with initial Web, Rundown, and Social copy versions. Continue through the tabs below.

### Overview

1. Confirm district and title.
2. Select a Category if one is applicable. Do not force a category when none fits.
3. Set the requested lifecycle.
4. Choose **Save Overview** and verify the success message.

### Facts

Enter internal reporting notes, verified facts, attribution details, unanswered questions, and other material that should inform copy but is not itself the public article. Choose **Save Notes**.

Do not use Facts as a substitute for Web Copy.

### Copy

The page contains three independent editors:

- **Web Copy** for the public article.
- **Rundown Copy** for presenter/script use.
- **Social Copy** for social output.

For each requested stream:

1. Enter or revise its Headline.
2. Enter the body in the rich-text editor.
3. Check **Information changed** only when the underlying reported information changed, not for ordinary wording or formatting edits.
4. Choose **Save New [stream name] Version**.
5. Verify that **Current version** increments.

Saving one stream does not save the other streams.

### Sources and documents

Use **Sources** for people, organizations, records, or other reporting sources. After a source is associated with the Story, select it in the document-upload area and upload the supporting document. Source documents are private reporting material; do not expose them as public Story assets.

### Assets

Use the **Assets** tab for public media:

- Use the Cloudinary library/uploader to select or upload images. Do not paste a manual Cloudinary URL.
- Use the Mux uploader for a new video.
- Use the Mux Library picker for an existing accessible video. A contributor is limited to the contributor's own uploads.
- A Mux video can be visible before it is ready, but it cannot be selected until processing reaches `ready`.
- Use **Create Graphic** to open a graphics generator already scoped to this Story. A graphic saved from that route is stored in Cloudinary and attached to the Story.

After adding media, verify that it appears in the attached asset list with the expected preview and title.

### Tags and links

Use canonical Tags already present in NRCS. Link related Events and Stories with the search pickers. Do not create duplicate taxonomy merely to satisfy a task.

### Review flags

Open flags require editorial attention. Do not resolve a flag merely to clear the warning. Resolve it only after performing the requested review and only when the assignment authorizes that action.

### Web and Social outputs

Open **Web Output**, then **Edit Web & Social Outputs**, only when the assignment includes output preparation or publication. Select the intended saved copy version and media. Publication/delivery is a separate editorial action; drafting copy alone does not require it.

## 5. Edit an Existing Story

1. Open **Stories**.
2. Apply the correct district and lifecycle filters.
3. Search for the Story by title.
4. Open the record and confirm the title and district before editing.
5. Change only the requested tabs.
6. Save each changed section separately and verify every success message or version increment.

If a requested Story is not visible, stop and report the problem. Do not recreate it. The cause may be district scope, role visibility, lifecycle, or ownership.

## 6. Create or Edit an Event

### Create an Event

1. Open **Events**.
2. Confirm the district.
3. Choose **New Event**.
4. Set **Status** to `Draft` unless publication is explicitly authorized.
5. Enter the title.
6. Enter Start and, when known, End date/time.
7. Enter Location Name, Address, City, State, and ZIP.
8. Select one Classification when applicable, or leave it as **None**.
9. Use the Cloudinary Event Image control to upload or select an image. Verify the image preview.
10. Enter Details in the rich-text editor.
11. Choose **Save Event**.
12. Verify both the NRCS save confirmation and the CMS delivery result shown after save.

Drafts may be incomplete. Publishing requires title, start time, location name, address, city, state, and ZIP.

Event Classification is mutually exclusive and may be a district-managed Sport, Extracurricular Activity, or Other Event Type. Disabled classifications remain on existing Events but cannot be selected for a new Event.

### Edit an Event

1. Open **Events** and apply district/status filters.
2. Open the correct Event and verify title, date, and district.
3. Make the requested changes.
4. Choose **Save Event**.
5. Verify the NRCS confirmation and CMS delivery result.

### Duplicate an Event

Use **Duplicate** from the Event list only when requested. Duplication copies the Event into an editable new Draft. Review every copied field, especially dates and times, before saving or publishing.

Do not use recurrence. NRCS intentionally uses Event duplication instead of recurring-event logic.

### Event image rule

Always use the Cloudinary control. Do not type or paste an image URL. Confirm that a submitted or selected image appears in the preview before reporting the Event complete.

## 7. Create and Edit Program Rundowns

This workflow requires the Producer role or higher.

### Create a Rundown from a Template

1. Open **Programs**.
2. Confirm the district.
3. Locate the correct Program and Template.
4. Choose **Create Rundown from Template**.
5. Enter an Edition Title, or leave it empty to use the generated Program/date title.
6. Confirm the selected Template.
7. Select **Live** or **Recorded**.
8. Enter the mandatory **Scheduled Air Date/Time** in the displayed district timezone.
9. Enter **Recording Date/Time** when applicable.
10. Choose **Create Rundown**.
11. Verify the success message and inspect the copied template items.

Only Editors/Admins manage Programs and Templates. Template edits affect future Rundowns only and do not rewrite an already-created Rundown.

### Edition settings

In the Rundown editor, verify or update:

- Title
- Status: `draft`, `ready`, `recorded`, `aired`, or `archived`
- Mode: `live` or `recorded`
- Scheduled Air Date/Time
- Recording Date/Time, when applicable

Choose **Save Edition** and verify the success message. Unless instructed otherwise, keep a newly drafted Edition at `draft`.

### Add a Story from the Rundown

1. Ensure the Story already has saved Rundown Copy.
2. In the Edition, find **Add Story**.
3. Choose **Search Stories To Add**.
4. Enter at least two characters to search, or use the initial results.
5. Select the correct Story and copy version. Selection immediately adds that exact version to the Rundown.
6. Verify that the Story item appears in the Rundown list.

If the Story does not appear, return to the Story's **Copy** tab and save a Rundown Copy version. Also confirm that the Story and Edition belong to the same district.

### Add a Story from the Story page

Editors can also open the Story's **Production** tab, choose an upcoming Edition, and attach the current Rundown Copy version. Save Rundown Copy first. Verify the item in the destination Edition afterward.

### Add manual items

Under **Add Segment, Script, or Note**:

1. Select an item Type: Segment Item, Script Item, or Production Note.
2. Enter the Title.
3. For Segment Items, select a Segment Kind when applicable: Intro, News, Events, Weather, Sports Scores, Upcoming Sports, Break, or Outro.
4. Enter Body content.
5. Choose **Add Item**.
6. Verify that the item appears in the Rundown.

Production Notes are excluded from the continuous Script View.

### Edit and order Rundown items

- Use **Up** and **Down** to place items in the intended running order.
- Use **Save Item** after editing an item's title, body, Segment Kind, or checked state.
- **Checked in rundown** is a production state; do not change it unless asked.
- A Story item's copy body is pinned to its selected version. Edit the Story's Rundown Copy and deliberately add/use a new version when updated text is required.
- **Carry To Tomorrow** keeps the same pinned copy version.
- **Carry With New Copy Version** creates a new copy version for the carried item.
- **Remove Item** is destructive and is not available to a Producer.

### Script View

Use **Script View** to inspect the continuous script. It excludes Production Notes. Return with **Edit Rundown**. This is currently an inspection view inside NRCS; no automatic scrolling should be assumed.

## 8. Create Graphics

NRCS provides Generic, Sports, and Weather generators. The preferred entry point is the related Story or Edition so the saved graphic is attached automatically.

### Open with the correct context

- Story: open **Assets** and choose **Create Graphic**.
- Edition: open the Rundown and choose **Create Graphic** under **Edition Graphics**.
- The standalone **Graphics** sidebar page creates a district asset but has no Story or Edition attachment context.

At the top of Graphics, switch among **Generic**, **Sports**, and **Weather**. Confirm the district and the context label before saving.

The generator preview has a **Download PNG** control. That downloads a file only. To store and attach the current graphic in NRCS, complete the metadata below the generator and choose the outer **Save to Cloudinary** button.

### Generic generator

1. Select Color Mode: Default, Alert, or Breaking.
2. Enter optional Kicker/category, Headline, and Body.
3. Choose whether to reserve photo space for later composition.
4. Select Canvas size: Vertical 1080 x 1920, Horizontal 1920 x 1080, or KRTR Panel 1080 x 1160.
5. Use Transparent background only when required.
6. The photo guide is preview-only and is not exported.
7. Review the preview for clipped or undersized text.

### Weather generator

1. For Today, select the weather icon and enter High, Heading, and Short description.
2. For Tonight, select the weather icon and enter Low, Heading, and Short description.
3. Select Canvas size.
4. Enter the Top title.
5. Use Transparent background only when required.
6. Review the preview. Weather icons require network access to load.

### Sports generator

1. Select **Upcoming** or **Past / Final**.
2. Select Sport.
3. Select Event type: Game / Match / Dual or Meet / Invitational / Tournament.
4. Enter Date, Time when applicable, Location, and optional Event name.
5. Select the Primary school.
6. For head-to-head events, select Opponent and Home/VS or Away/AT.
7. For multi-school events, optionally select the Host school and enter the opponent/field label.
8. For Past / Final, enter scores and outcome label, or the result/finish and optional highlight for a multi-school event.
9. Select Canvas size and transparency.
10. Verify school identities, mascots, opponent, score, and home/away wording in the preview.

### Save a generated graphic

1. Below the generator, enter an **Asset Title**.
2. Select a Category when appropriate.
3. Search for and select applicable Tags.
4. Choose **Save to Cloudinary**.
5. Wait for the `Saving to Cloudinary and NRCS...` status to finish.
6. Verify the green success message and saved image preview.
7. Return to the Story or Rundown and verify that the graphic appears in its asset section.

If rendering succeeds but upload fails, use **Retry Save**. Do not repeatedly create new assets for the same graphic.

## 9. Final Verification Checklist

Before reporting a drafting task complete, verify:

- Correct district and correct record; no accidental duplicate was created.
- Requested status/lifecycle was used, with no unrequested publication or archive action.
- Every edited form shows a successful save.
- Story: Facts and public Copy are in the correct tabs.
- Story: each requested copy stream has the expected current version.
- Event: date/time, location, classification, image preview, and CMS delivery result are correct.
- Rundown: mode, air time, status, item order, and exact Story copy versions are correct.
- Graphic: correct generator, dimensions, content, school identity, metadata, and attachment are visible.
- No unresolved error banner was ignored.

## 10. Completion Report

Use this concise format when returning work to the requester:

```text
Completed:
- [record type and title]
- District: [district]
- Status/lifecycle: [value]
- Saved sections/versions: [details]
- Assets/graphics: [details]
- Rundown/Edition: [details, if applicable]

Not changed:
- [publication, archive, flags, or other intentionally untouched areas]

Issues requiring review:
- [exact error or ambiguity, or "None"]
```

Do not report publication, CMS delivery, media attachment, or a save as successful unless the UI visibly confirmed it.
