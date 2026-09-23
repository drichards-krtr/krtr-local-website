-- TARGET: NRCS Supabase database. Editable initial records, disabled until tested/configured.
begin;
insert into public.nrcs_calendar_sources(id,district_key,name,adapter_type,url,feed_url,extraction_notes,enabled)
select id::uuid,'dlpc',name,adapter,url,feed,notes,false from (values
 ('cafe0000-0000-4000-8000-000000000001','La Porte City Museum','generic_web','https://www.laportecitymuseum.org/events',null,'Wix Events. Follow detail pages and expand occurrences. Mixed historical and future entries.'),
 ('cafe0000-0000-4000-8000-000000000002','City of Dysart','ical','https://localendar.com/public/CityofDysart-IA','https://localendar.com/public/CityofDysart-IA?style=X2','Verified public iCalendar transport. Validate recurrence and coverage.'),
 ('cafe0000-0000-4000-8000-000000000003','Norma Anders Public Library','rss','https://www.dysart.lib.ia.us/events','https://www.dysart.lib.ia.us/ccm/calendar/feed/82','Concrete CMS calendar. Preserve occurrenceID. Verify pubDate event-time meaning against detail pages.'),
 ('cafe0000-0000-4000-8000-000000000004','City of La Porte City','rss','https://www.lpcia.com/calendar','https://www.lpcia.com/calendar/rss','Access unresolved: 403. Alternate https://laportecityia.civicpluswebopen.com/calendar/json returns Cloudflare challenge. Never treat challenge as empty inventory.'),
 ('cafe0000-0000-4000-8000-000000000005','LPC Chamber of Commerce','ical','https://www.lpcia.com/development/page/chamber-commerce','https://calendar.google.com/calendar/ical/c_e148112c20b9c94f62f2ddee4c18c8f56012a39544b4e8c0ff3d624d0011df60%40group.calendar.google.com/public/basic.ics','Verified public feed. America/Chicago. Contains historical and date-only records.'),
 ('cafe0000-0000-4000-8000-000000000006','Facebook Explore La Porte City','facebook_explore','https://www.facebook.com/events/explore/la-porte-city-iowa/105549916145306',null,'Configured location only. Provider unverified. Discovery results cannot support disappearance detection.'),
 ('cafe0000-0000-4000-8000-000000000007','Facebook Explore Dysart','facebook_explore','https://www.facebook.com/events/explore/dysart-iowa/108215595874021',null,'Configured location only. Provider unverified. Discovery results cannot support disappearance detection.')
) as seed(id,name,adapter,url,feed,notes)
where exists(select 1 from public.nrcs_districts where district_key='dlpc')
on conflict(id) do nothing;
commit;
