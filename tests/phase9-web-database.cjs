const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.PGLITE_PATH || "../.tmp/phase8-test/node_modules/@electric-sql/pglite");
const id = n => `f9000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create function public.is_admin() returns boolean language sql as $$select false$$;
      create table districts(district_key text primary key,enabled boolean default true);
      insert into districts(district_key) values('dlpc'),('other');
      create table stories(id uuid primary key default gen_random_uuid(),district_key text references districts,title text not null,tease text,body_markdown text not null,status text not null check(status in ('draft','published','archived')),published_at timestamp,slug text unique,image_url text,cloudinary_public_id text,mux_asset_id text,mux_playback_id text,mux_status text,video_orientation text,tags text[] default '{}',created_at timestamp default now(),updated_at timestamp default now());
      create table events(id uuid primary key default gen_random_uuid(),nrcs_source_id uuid unique,district_key text,title text,description text,body_html text,location_name text,address text,city text,state text,zip text,location text,start_at timestamp,end_at timestamp,image_url text,status text,is_school_sports boolean);
      create type event_classification_kind as enum('sport','activity','type');
      create table event_classification_terms(id uuid primary key default gen_random_uuid(),district_key text,kind event_classification_kind,name text,enabled boolean,unique(district_key,kind,name));
      create table event_classification_assignments(event_id uuid,term_id uuid);
      grant all on all tables in schema public to service_role;`);
    await db.exec(fs.readFileSync("supabase/migrations/20260918000100_phase_7_nrcs_receiving.sql", "utf8"));
    await db.exec(fs.readFileSync("supabase/migrations/20260919000100_phase_9_web_projection.sql", "utf8"));
    await db.exec(`insert into stories(id,district_key,title,body_markdown,status,slug) values('${id(1)}','dlpc','Legacy','Old Markdown','published','legacy-story');`);
    const base = { schema_version: 1, request_id: id(2), source_id: id(3), district_key: "dlpc", revision: 1, kind: "web", payload: { story_id: id(4), copy_version_id: id(5), title: "Updated", body_html: "<p>HTML copy</p>", tease: null, slug: "legacy-story", status: "published", published_at: "2026-01-01T12:00:00Z", scheduled_at: null, hero: null, video: null, category: null, tags: [], article_media: [] } };
    async function send(envelope) { return (await db.query("select receive_nrcs_web_publication($1,$2) receipt", [JSON.stringify(envelope), String(envelope.revision).padStart(64, "a")])).rows[0].receipt; }
    const receipt = await send(base);
    assert.equal(receipt.cms_article_id, id(1), "Legacy CMS article ID must be retained");
    assert.equal(receipt.state, "published");
    assert.equal((await send(base)).cms_article_id, id(1));
    assert.equal((await db.query("select count(*) n from stories")).rows[0].n, 1);
    const linkedRename = { ...base, request_id: id(8), revision: 2, payload: { ...base.payload, cms_article_id: id(1), slug: "updated-slug" } };
    assert.equal((await send(linkedRename)).cms_article_id, id(1), "Edited slugs must not break imported CMS identity");
    assert.equal((await db.query("select story_id from story_slug_aliases where slug='legacy-story'")).rows[0].story_id, id(1), "Old public slug must retain its article relationship");
    const otherDistrict = { ...base, request_id: id(9), source_id: id(10), district_key: "other", payload: { ...base.payload, cms_article_id: id(1) } };
    await assert.rejects(send(otherDistrict), /another district/);
    const schedule = { ...base, request_id: id(6), revision: 3, payload: { ...base.payload, status: "scheduled", scheduled_at: "2099-01-01T00:00:00Z", published_at: null } };
    assert.equal((await send(schedule)).state, "scheduled");
    assert.equal((await db.query("select count(*) n from stories where status='published' and (published_at is null or published_at<=now() at time zone 'UTC')")).rows[0].n, 0);
    const unpublish = { ...base, request_id: id(7), revision: 4, payload: { ...base.payload, status: "unpublished" } };
    assert.equal((await send(unpublish)).state, "unpublished");
    await send(base);
    assert.equal((await db.query("select status from stories where id=$1", [id(1)])).rows[0].status, "archived", "Stale retry must not republish");
    await db.exec("set role authenticated");
    await assert.rejects(send(base), /permission denied/);
    await db.exec("reset role");
    console.log("Phase 9 PostgreSQL Web projection ID preservation, retry, scheduling, unpublish, stale revision and RPC permissions passed.");
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
