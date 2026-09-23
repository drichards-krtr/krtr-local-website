# Calendar ingestion seed source assessment

Evaluated September 22, 2026. This is an initial technical assessment, not an implemented adapter or guarantee of production access. All sources remain editable, enableable, and disableable through the planned NRCS Source Registry. Apply the agreed 90-day horizon and human editorial workflow.

| Seed | Observed evidence | Planned adapter and remaining validation |
| --- | --- | --- |
| https://www.laportecitymuseum.org/events | Readable Wix-hosted event listings with individual `/event-details/` URLs, images, and mixed future/past entries. Some listings indicate multiple dates. | Existing `generic_web` family with a Wix Events parsing profile. Follow event details for complete dates/times and occurrences; do not use the listing title or footer address as proof of event details. Confirm full inventory before enabling disappearance checks. |
| https://localendar.com/public/CityofDysart-IA#google_vignette | Public HTML advertises RSS at `?style=M3` and iCalendar at `?style=X2`. | Prefer existing `ical` adapter using https://localendar.com/public/CityofDysart-IA?style=X2 ; RSS is a fallback. Strip the advertising fragment from the source URL. Validate recurrence, time zones, and export coverage. |
| https://www.dysart.lib.ia.us/events | Concrete CMS page advertises https://www.dysart.lib.ia.us/ccm/calendar/feed/82 . Feed retrieved successfully with 589 items and occurrence-specific links/guids containing `occurrenceID`. | Existing `rss` family with a Concrete CMS calendar parsing profile. Preserve occurrence IDs; verify event time against detail pages before interpreting this feed's `pubDate` as start time. RSS publication dates are not generically event dates. Apply 90-day filtering and verify inventory coverage separately. |
| https://www.lpcia.com/calendar | Page requests returned 403. User subsequently supplied https://www.lpcia.com/calendar/rss ; direct retrieval also returned 403, and the web reader could not access it. | Prefer `rss` at the supplied endpoint once access and actual XML are verified. Feed contents and coverage remain unverified. Browser/provider testing or publisher assistance may be needed; access failure is not an empty calendar. |
| https://www.lpcia.com/development/page/chamber-commerce | User identified a Google Calendar embed and supplied its calendar ID. Its public iCalendar endpoint returned HTTP 200, `text/calendar`, calendar name `LPC Chamber of Commerce`, timezone `America/Chicago`, and 60 VEVENT components. | Use existing `ical` adapter against the verified public Google feed below. No browser scraping, Google login, or OAuth was needed to retrieve this feed. Validate recurrence and 90-day coverage before enabling disappearance detection. |
| https://www.facebook.com/events/explore/la-porte-city-iowa/105549916145306 | Configured geographic Explore URL; web reader could not retrieve content. | New proposed `facebook_explore` adapter, pending provider capability testing. Limit discovery to this configured location. |
| https://www.facebook.com/events/explore/dysart-iowa/108215595874021 | Configured geographic Explore URL; web reader could not retrieve content. | Same proposed `facebook_explore` adapter, pending provider capability testing. Limit discovery to this configured location. |

## Additions and scope change

Additional city endpoint supplied and tested September 22: https://laportecityia.civicpluswebopen.com/calendar/json . Direct HTTP retrieval returned 403 with a Cloudflare managed challenge asking for JavaScript and cookies, not event JSON. Record it as an alternate transport for the same city source, not a separate source producing duplicate candidates. Its JSON schema, date-range parameters, pagination, and inventory completeness remain unverified. If accessible during browser/provider testing, evaluate a CivicPlus JSON parsing profile; no new adapter is confirmed necessary yet. Never interpret the challenge response as an empty inventory.

The Chamber's verified public feed is https://calendar.google.com/calendar/ical/c_e148112c20b9c94f62f2ddee4c18c8f56012a39544b4e8c0ff3d624d0011df60%40group.calendar.google.com/public/basic.ics . Calendar ID: `c_e148112c20b9c94f62f2ddee4c18c8f56012a39544b4e8c0ff3d624d0011df60@group.calendar.google.com`. This was derived from the user-supplied Add to Google Calendar URL and verified by direct HTTP retrieval. The 60 components are not a count of upcoming occurrences: the feed includes historical records and all-day records. Preserve UIDs, time zones, date-only semantics, and any recurrence exceptions. Apply normal draft/publication rules without inventing times for date-only entries.

Wix Events and Concrete CMS calendar parsing profiles specialize existing generic-web and RSS adapter families; they do not require new top-level source types. Localendar advertises formats already covered by the spec.

The two user-supplied Facebook Explore seeds require a geographic-discovery capability excluded by the original specification. Treat the user's explicit seed list and adapter authorization as a bounded expansion for configured Explore locations, not authorization for unrestricted regional crawling. Notify the user of the proposed `facebook_explore` addition. Neither provider coverage nor usable retrieval has been verified; record unsupported access as a source-health problem, not a successful empty scan.

Explore results must not be treated as complete inventories or used to infer cancellation from disappearance. Preserve discovered event IDs and direct event URLs for deduplication and possible direct-event monitoring. Any direct monitoring also requires its own verified completeness semantics.

## Validation before enabling production scans

- Verify detailed event times, recurrence identity, feed date-window coverage, and pagination with representative fixtures.
- Resolve access to the city RSS endpoint and verify its schema and date coverage. The Chamber already has a readable structured feed and does not require the blocked city page for ingestion.
- Test both configured Facebook Explore locations in the provider bake-off; expose unsupported sources clearly in NRCS.
- Keep scraped observations separate from human publication and restoration actions.
- Keep the seed page URL and transport/feed URL separately where useful, so editors recognize and can modify the source.

No sources have been created in a live registry and no scraping provider has been purchased or configured by this assessment.
