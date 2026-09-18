const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.PGLITE_PATH || "../.tmp/phase8-test/node_modules/@electric-sql/pglite");
const id = n => `f9100000-0000-0000-0000-${String(n).padStart(12, "0")}`;
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table nrcs_stories(id uuid primary key,district_key text,lifecycle_state text);
      create table nrcs_web_outputs(id uuid primary key,story_id uuid,district_key text,revision integer,copy_version_id uuid);
      create table nrcs_publication_deliveries(request_id uuid primary key,kind text,source_id text,revision integer,district_key text,status text,package jsonb,content_hash text,receipt jsonb);
      insert into nrcs_stories values('${id(1)}','dlpc','ready');
      insert into nrcs_web_outputs values('${id(2)}','${id(1)}','dlpc',1,'${id(3)}');`);
    await db.exec(fs.readFileSync("supabase/nrcs/migrations/20260919000100_phase_9_web_confirmation.sql", "utf8"));
    const hash = "a".repeat(64);
    const receipt = { request_id: id(4), source_id: id(2), district_key: "dlpc", revision: 1, current_projection_revision: 1, content_hash: hash, state: "scheduled", cms_article_id: id(5), published_at: null };
    await db.query("insert into nrcs_publication_deliveries(request_id,kind,source_id,revision,district_key,status,package,content_hash) values($1,'web',$2,1,'dlpc','sending',$3,$4)", [id(4), id(2), JSON.stringify({ payload: { story_id: id(1), copy_version_id: id(3) } }), hash]);
    const state = async () => (await db.query("select lifecycle_state from nrcs_stories")).rows[0].lifecycle_state;
    await db.query("update nrcs_publication_deliveries set status='received',receipt=$1", [JSON.stringify(receipt)]);
    assert.equal(await state(), "ready", "Scheduled receipt must not activate a Story");
    const published = { ...receipt, state: "published", published_at: "2026-09-17T12:00:00Z" };
    const confirm = async (r, current = true, checked = "2026-09-17T12:01:00Z") => db.query("select nrcs_record_publication_status($1,$2)", [id(4), JSON.stringify({ receipt: r, current, checked_at: checked })]);
    await confirm(published);
    assert.equal(await state(), "active");
    await db.exec("grant select,update on nrcs_publication_deliveries,nrcs_stories,nrcs_web_outputs to service_role; set role service_role");
    await confirm(published, true, "2026-09-17T12:01:30Z");
    await db.exec("reset role");
    assert.equal((await db.query("select revision from nrcs_web_outputs")).rows[0].revision, 1, "Confirmation must not change output revision");
    assert.deepEqual((await db.query("select receipt from nrcs_publication_deliveries")).rows[0].receipt, receipt, "Initial receipt remains immutable during status refresh");
    await db.exec("update nrcs_stories set lifecycle_state='ready'; update nrcs_web_outputs set revision=2");
    await confirm(published, true, "2026-09-17T12:02:00Z");
    assert.equal(await state(), "ready", "Older output revision must not activate current Story");
    await db.exec("update nrcs_web_outputs set revision=1");
    await confirm({ ...receipt, state: "received_non_public", cms_article_id: null }, false, "2026-09-17T12:03:00Z");
    assert.equal(await state(), "ready");
    await confirm(published, true, "2026-09-17T12:02:30Z");
    assert.equal(await state(), "ready", "Out-of-order confirmation must be ignored");
    for (const lifecycle of ["closed", "dormant", "reporting", "idea"]) {
      await db.query("update nrcs_stories set lifecycle_state=$1", [lifecycle]);
      await confirm(published, true, `2026-09-17T12:0${4 + ["closed", "dormant", "reporting", "idea"].indexOf(lifecycle)}:00Z`);
      assert.equal(await state(), lifecycle, "Only Ready Stories activate");
    }
    await db.exec("set role authenticated");
    await assert.rejects(confirm(published), /permission denied/);
    await db.exec("reset role");
    await db.exec("update nrcs_stories set lifecycle_state='ready'");
    await db.query("update nrcs_publication_deliveries set confirmation=null,receipt=$1", [JSON.stringify({ ...receipt, state: "received_non_public", cms_article_id: null })]);
    assert.equal(await state(), "ready", "Private receipts must not activate Stories");
    await assert.rejects(db.query("update nrcs_publication_deliveries set receipt=$1", [JSON.stringify({ ...published, district_key: "other" })]), /Invalid publication/);
    assert.equal(await state(), "ready", "Invalid confirmation must roll back");
    await db.query("update nrcs_publication_deliveries set receipt=$1", [JSON.stringify(published)]);
    assert.equal(await state(), "active", "Initial live receipt activates Ready atomically too");
    console.log("Phase 9 atomic lifecycle, schedule gating, stale/output revision, immutable receipt, out-of-order status and permissions passed.");
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
