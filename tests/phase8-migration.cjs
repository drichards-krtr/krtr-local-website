const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require(process.env.PGLITE_PATH || "../.tmp/phase8-test/node_modules/@electric-sql/pglite");
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(name => name in mocks ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}
const richText = load("apps/nrcs/lib/richText.ts");
const migration = load("apps/nrcs/lib/migration.ts", { "./richText": richText, "./mux": { getMuxCredentials: () => null }, "./env": { getNrcsCmsApiEnv: () => ({ baseUrl: "https://cms.example", secret: "fixture" }) } });
const markdown = load("lib/legacyMarkdown.ts", { "./nrcsPublication": { sanitizePublicationHtml: richText.sanitizeRichTextHtml } });
assert.match(markdown.convertLegacyMarkdown("# Headline\n\n**Bold** and *italic*\n\n> Quote\n\n1. First\n2. Second").html, /<blockquote>/);
assert.deepEqual(markdown.convertLegacyMarkdown("[Link](https://example.test)").issues, []);
assert.ok(markdown.convertLegacyMarkdown("### Heading\n\n![Image](https://example.test/image.jpg)").issues.length);
assert.ok(markdown.convertLegacyMarkdown("[Bad](javascript:alert)").issues.length);
assert.equal(migration.migrationHash({ b: 2, a: 1 }), migration.migrationHash({ a: 1, b: 2 }));
assert.equal(migration.utcTimestamp("2026-09-10T12:30:00"), "2026-09-10T12:30:00Z");
assert.equal(migration.utcTimestamp("2026-09-10T12:30:00.123456"), "2026-09-10T12:30:00.123456Z");
assert.throws(() => migration.utcTimestamp("2026-02-30T12:30:00"));
assert.throws(() => migration.utcTimestamp("bad"));
const admin = "f7000000-0000-0000-0000-000000000001";
const contributor = "f7000000-0000-0000-0000-000000000002";
const source = "f7000000-0000-0000-0000-000000000003";
const eventSource = "f7000000-0000-0000-0000-000000000004";
const recovered = "f7000000-0000-0000-0000-000000000005";
const story = { id: source, district_key: "dlpc", title: "Legacy Story", tease: "Tease", status: "published", published_at: "2026-09-10T12:30:00", created_at: "2026-09-09T12:30:00", updated_at: "2026-09-10T12:30:00", slug: "legacy-story", converted_html: '<p onclick="bad()">Copy<script>bad()</script></p>', tags: ["dysart"], tag_definitions: [{ slug: "dysart", name: "Dysart" }], image_url: "https://res.cloudinary.com/fixture/image/upload/logo.jpg", image_public_id: "legacy/photo", mux_asset_id: "mux-fixture", mux_playback_id: "playback-fixture", mux_status: "ready", video_orientation: "vertical", submitters: [{ id: contributor, name: "Submitter", email: "private@example.test", phone: "123", created_at: "2026-09-09T12:30:00" }] };
assert.equal(migration.normalizeLegacy("stories", story, admin).normalized.body_html, "<p>Copy</p>");
assert.equal(migration.normalizeLegacy("stories", { ...story, published_at: "2099-01-01T00:00:00" }, admin).normalized.output_status, "scheduled");
assert.equal(migration.normalizeLegacy("stories", { ...story, status: "archived" }, admin).normalized.lifecycle_state, "closed");
assert.ok(migration.normalizeLegacy("stories", { ...story, published_at: null }, admin).errors.length);
const event = { id: eventSource, nrcs_source_id: recovered, district_key: "dlpc", title: "Event", description: "Literal <script>not markup</script>", status: "draft", start_at: "2026-09-18T12:30:00", created_at: story.created_at, updated_at: story.updated_at, link_1_url: "https://example.test", link_1_text: "Details" };
assert.equal(migration.normalizeLegacy("events", event, admin).normalized.target_id, recovered);
assert.match(migration.normalizeLegacy("events", event, admin).normalized.body_html, /&lt;script&gt;/);
assert.match(migration.normalizeLegacy("events", event, admin).normalized.body_html, /Details/);
assert.ok(migration.normalizeLegacy("events", { ...event, is_school_sports: true }, admin, new Date("2026-09-17T12:00:00Z")).errors.length);
assert.ok(migration.normalizeLegacy("events", { ...event, start_at: "2026-02-30T12:30:00" }, admin).errors.length);

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated;
      alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;`);
    const files = fs.readdirSync("supabase/nrcs/migrations").filter(file => file.endsWith(".sql")).sort();
    for (const file of files) {
      const sql = fs.readFileSync(`supabase/nrcs/migrations/${file}`, "utf8").replace("create extension if not exists pgcrypto;", "-- gen_random_uuid is built into the test PostgreSQL runtime.");
      try { await db.exec(sql); } catch (error) { throw new Error(`${file}: ${error.message}`); }
    }
    await db.exec(`create table public.districts(district_key text primary key);
      create table public.stories(id uuid, district_key text, submitter_id uuid);
      create table public.events(id uuid, district_key text, submitter_id uuid);
      create table public.story_submitters(id uuid,submitted_story_id uuid);
      create table public.event_submitters(id uuid,submitted_event_id uuid);`);
    await db.exec(fs.readFileSync("supabase/migrations/20260918000200_phase_8_migration_export_audit.sql", "utf8"));
    await db.exec(`insert into public.story_submitters(id) values('${source}');`);
    assert.equal((await db.query("select public.nrcs_legacy_migration_audit() result")).rows[0].result.unassigned_story_submitters, 1);
    await db.exec(`insert into auth.users(id,email) values('${admin}','admin@example.test'),('${contributor}','contributor@example.test');
      insert into nrcs_staff_profiles(id,email,role) values('${admin}','admin@example.test','admin'),('${contributor}','contributor@example.test','contributor');
      select set_config('test.uid','${admin}',false);`);
    async function run() {
      return (await db.query("insert into nrcs_migration_runs(district_key,created_by,phase) values('dlpc',$1,'import') returning id", [admin])).rows[0].id;
    }
    async function stage(runId, kind, raw, mapping = {}) {
      const result = migration.normalizeLegacy(kind, raw, admin, new Date(), "America/Chicago", mapping);
      return (await db.query("insert into nrcs_migration_items(run_id,kind,source_id,source_hash,raw,normalized,errors,warnings) values($1,$2,$3,$4,$5,$6,$7,$8) returning id", [runId, kind, result.normalized.source_id, migration.migrationHash(raw), JSON.stringify(raw), JSON.stringify(result.normalized), JSON.stringify(result.errors), JSON.stringify(result.warnings)])).rows[0].id;
    }
    async function apply(runId, itemId) {
      const token = (await db.query("select nrcs_migration_claim($1) token", [runId])).rows[0].token;
      const result = (await db.query("select nrcs_migration_apply($1,$2) status", [itemId, token])).rows[0].status;
      const item = (await db.query("select detail from nrcs_migration_items where id=$1", [itemId])).rows[0];
      await db.query("update nrcs_migration_runs set lease_until=null,lease_token=null where id=$1", [runId]);
      assert.notEqual(result, "failed", item.detail);
      return result;
    }
    const first = await run();
    assert.equal(await apply(first, await stage(first, "tags", { district_key: "dlpc", slug: "unused-tag", name: "Unused Tag" })), "imported");
    const termRaw = { id: "f7000000-0000-0000-0000-000000000010", district_key: "dlpc", name: "Football", kind: "sport", enabled: true };
    assert.equal(await apply(first, await stage(first, "terms", termRaw)), "imported");
    const firstItem = await stage(first, "stories", story);
    assert.equal((await db.query("select count(*) n from nrcs_stories")).rows[0].n, 0, "Staging must not create editorial rows");
    assert.equal(await apply(first, firstItem), "imported");
    assert.equal(await apply(first, firstItem), "imported", "Retry must not duplicate");
    assert.equal((await db.query("select count(*) n from nrcs_copy_versions")).rows[0].n, 1);
    assert.equal((await db.query("select count(*) n from nrcs_publication_deliveries")).rows[0].n, 0, "Import must not send to CMS");
    assert.equal((await db.query("select count(*) n from nrcs_web_output_media")).rows[0].n, 1);
    assert.equal((await db.query("select created_by from nrcs_assets where asset_type='video'")).rows[0].created_by, null);
    assert.equal((await db.query("select status from nrcs_intake_items")).rows[0].status, "converted");
    const eventItem = await stage(first, "events", event);
    assert.equal(await apply(first, eventItem), "imported");
    assert.equal((await db.query("select id from nrcs_events")).rows[0].id, recovered);
    const slots = { district_key: "dlpc", slot: "lineup", slots: [{ slot: "hero", story_id: source }, { slot: "top1", story_id: null }] };
    assert.equal(await apply(first, await stage(first, "slots", slots)), "imported");
    await db.query("update nrcs_migration_runs set phase='complete' where id=$1", [first]);
    const second = await run();
    assert.equal(await apply(second, await stage(second, "stories", story)), "unchanged");
    assert.equal(await apply(second, await stage(second, "slots", slots)), "unchanged");
    await db.query("update nrcs_migration_runs set phase='complete' where id=$1", [second]);
    const third = await run();
    assert.equal(await apply(third, await stage(third, "tags", { district_key: "dlpc", slug: "unused-tag", name: "Updated Tag" })), "imported");
    assert.equal(await apply(third, await stage(third, "terms", { ...termRaw, enabled: false })), "imported");
    assert.equal((await db.query("select enabled from nrcs_event_classification_terms where name='Football' and district_key='dlpc'")).rows[0].enabled, false);
    const termTarget = (await db.query("select target_id from nrcs_migration_identities where kind='terms' and source_id=$1", [termRaw.id])).rows[0].target_id;
    assert.equal(await apply(third, await stage(third, "events", { ...event, is_school_sports: true }, { classification_target_id: termTarget })), "imported");
    assert.equal((await db.query("select classification_term_id from nrcs_events")).rows[0].classification_term_id, termTarget);
    assert.equal(await apply(third, await stage(third, "stories", { ...story, converted_html: "<p>New copy</p>" })), "imported");
    assert.equal((await db.query("select count(*) n from nrcs_copy_versions")).rows[0].n, 2);
    await db.exec("update nrcs_stories set title='Local edit'");
    await db.query("update nrcs_migration_runs set phase='complete' where id=$1", [third]);
    const fourth = await run();
    const fourthItem = await stage(fourth, "stories", { ...story, title: "CMS edit" });
    assert.equal(await apply(fourth, fourthItem), "conflict");
    await db.exec(`select set_config('test.uid','${contributor}',false);`);
    await assert.rejects(db.query("select nrcs_migration_claim($1)", [fourth]), /admin access/);
    await assert.rejects(db.query("select nrcs_migration_apply($1,$2)", [fourthItem, admin]), /authorized migration/);
    await assert.rejects(db.query("select nrcs_migration_report($1)", [fourth]), /admin access/);
    await db.exec(`select set_config('test.uid','${admin}',false);`);
    const failedItem = await stage(fourth, "stories", { ...story, id: "f7000000-0000-0000-0000-000000000006", title: "Duplicate slug" });
    const failureToken = (await db.query("select nrcs_migration_claim($1) token", [fourth])).rows[0].token;
    assert.equal((await db.query("select nrcs_migration_apply($1,$2) status", [failedItem, failureToken])).rows[0].status, "failed");
    assert.equal((await db.query("select count(*) n from nrcs_stories")).rows[0].n, 1, "Partial Story import must roll back");
    assert.equal((await db.query("select count(*) n from nrcs_copy_versions")).rows[0].n, 2);
    await db.exec(`select set_config('test.uid','${contributor}',false); set role authenticated;`);
    assert.equal((await db.query("select count(*) n from nrcs_migration_items")).rows[0].n, 0, "RLS must hide private migration records");
    await db.exec(`reset role; select set_config('test.uid','${admin}',false);`);
    const preview = (await db.query("select nrcs_temporary_editorial_reset() counts")).rows[0].counts;
    assert.ok(preview.nrcs_stories > 0);
    await db.exec("update nrcs_school_identities set logo_url='https://res.cloudinary.com/fixture/school-logo.png' where id=(select id from nrcs_school_identities limit 1); insert into nrcs_assets(asset_type,title,cloudinary_url) values('image','Protected School Logo','https://res.cloudinary.com/fixture/school-logo.png');");
    await assert.rejects(db.query("select nrcs_temporary_editorial_reset($1)", ["wrong"]), /Confirmation/);
    assert.ok((await db.query("select count(*) n from nrcs_stories")).rows[0].n > 0);
    await db.exec("insert into nrcs_sources(source_type,name) values('person','Reset rollback fixture'); create function test_reset_failure() returns trigger language plpgsql as $$ begin raise exception 'Injected reset failure'; end $$; create trigger test_reset_failure before delete on nrcs_sources for each row execute function test_reset_failure();");
    await assert.rejects(db.query("select nrcs_temporary_editorial_reset($1)", ["DELETE ALL NRCS EDITORIAL CONTENT"]), /Injected reset failure/);
    assert.equal((await db.query("select count(*) n from nrcs_stories")).rows[0].n, 1, "Failed reset must roll back earlier deletes");
    assert.ok((await db.query("select count(*) n from nrcs_migration_runs")).rows[0].n > 0);
    await db.exec("drop trigger test_reset_failure on nrcs_sources; drop function test_reset_failure();");
    await db.query("select nrcs_temporary_editorial_reset($1)", ["DELETE ALL NRCS EDITORIAL CONTENT"]);
    assert.equal((await db.query("select count(*) n from nrcs_stories")).rows[0].n, 0);
    assert.equal((await db.query("select count(*) n from nrcs_migration_runs")).rows[0].n, 0);
    assert.equal((await db.query("select count(*) n from nrcs_migration_identities")).rows[0].n, 0);
    assert.ok((await db.query("select count(*) n from nrcs_school_identities")).rows[0].n > 0);
    assert.equal((await db.query("select title from nrcs_assets")).rows[0].title, "Protected School Logo");
    console.log("Phase 8 mapping and PostgreSQL migration/import/retry/delta/conflict/permissions/reset tests passed.");
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
