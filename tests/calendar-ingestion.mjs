import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = process.cwd();
function loadTs(relative, mocks = {}) {
  const filename = path.resolve(root, relative);
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = name => name in mocks ? mocks[name] : name.startsWith(".") ? loadTs(path.resolve(path.dirname(filename), name + ".ts"), mocks) : require(name);
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}
const ingestion = loadTs("apps/nrcs/lib/calendarIngestion.ts");
const forms = loadTs("apps/nrcs/lib/eventForms.ts");
const run = {
  run_id: "a0000000-0000-4000-8000-000000000001", source_id: "cafe0000-0000-4000-8000-000000000001",
  status: "success", inventory_complete: true, window_start: "2026-09-23T00:00:00Z", window_end: "2026-12-22T00:00:00Z",
  candidates: [{ external_event_id: "event-1:2026-10-01", fields: { title: "Museum night", start_at: "2026-10-01T19:00", body_html: '<p>Original copy 🎉</p><script>alert(1)</script>' } }],
};
const valid = ingestion.validateCalendarRun(run);
assert.equal(valid.candidates[0].fields.address, null);
assert.equal(valid.candidates[0].fields.body_html, "<p>Original copy 🎉</p>");
assert.equal(ingestion.hashJson({ b: 2, a: 1 }), ingestion.hashJson({ a: 1, b: 2 }));
for (const bad of [
  { ...run, inventory_complete: true, status: "partial" },
  { ...run, candidates: [{ ...run.candidates[0], fields: { status: "published" } }] },
  { ...run, candidates: [{ ...run.candidates[0], fields: { start_at: "2026-10-01T19:00Z" } }] },
  { ...run, candidates: [{ ...run.candidates[0], fields: { start_at: "2026-02-30T19:00" } }] },
  { ...run, candidates: [run.candidates[0], run.candidates[0]] },
  { ...run, window_end: "2027-12-22T00:00:00Z" },
]) assert.throws(() => ingestion.validateCalendarRun(bad));
await assert.rejects(() => ingestion.readLimitedJson(new Request("https://test.invalid", { method: "POST", body: "x".repeat(101) }), 100));
process.env.NRCS_CALENDAR_INGEST_SECRET = "s".repeat(40);
assert.equal(ingestion.integrationAuthorized(new Request("https://test.invalid")), false);
assert.equal(ingestion.integrationAuthorized(new Request("https://test.invalid", { headers: { authorization: `Bearer ${"s".repeat(40)}` } })), true);
const draft = new FormData(); draft.set("status", "draft");
assert.equal(forms.getEventPayloadFromForm(draft, "dlpc").error, null);
assert.equal(forms.getEventPayloadFromForm(draft, "dlpc").payload.start_at, null);
draft.set("status", "published"); assert.ok(forms.getEventPayloadFromForm(draft, "dlpc").error);
for (const [key, val] of Object.entries({ title: "Complete", start_at: "2026-10-01T19:00", location_name: "Museum", address: "1 Main", city: "LPC", state: "IA", zip: "50651" })) draft.set(key, val);
assert.equal(forms.getEventPayloadFromForm(draft, "dlpc").error, null);

// Exercise route boundaries without network or live database credentials.
let rpcCalls = 0;
const api = loadTs("apps/nrcs/app/api/calendar-ingestion/route.ts", {
  "@/lib/calendarIngestion": ingestion,
  "@/lib/server": { createNrcsServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { enabled: true, district_key: "dlpc" } }) }) }) }), rpc: async () => { rpcCalls++; return { data: { run_id: run.run_id } }; } }) },
  "@/lib/cmsDistricts": { getCmsDistricts: async () => [{ district_key: "dlpc", enabled: false }] },
});
assert.equal((await api.POST(new Request("https://test.invalid", { method: "POST", body: JSON.stringify(run) }))).status, 401);
assert.equal((await api.POST(new Request("https://test.invalid", { method: "POST", body: JSON.stringify(run), headers: { authorization: `Bearer ${"s".repeat(40)}` } }))).status, 409);
assert.equal(rpcCalls, 0);
const relay = loadTs("apps/calendar/_ingest/app/api/runs/route.ts");
const previousFetch = globalThis.fetch;
process.env.CALENDAR_ORCHESTRATOR_SECRET = "o".repeat(40);
process.env.NRCS_API_BASE_URL = "https://nrcs.example.test";
try {
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://nrcs.example.test/api/calendar-ingestion");
    assert.equal(init.headers.Authorization, `Bearer ${"s".repeat(40)}`);
    assert.equal(init.redirect, "error");
    assert.deepEqual(JSON.parse(init.body.toString()), run);
    return Response.json({ ok: true, run_id: run.run_id });
  };
  assert.equal((await relay.POST(new Request("https://ingest.invalid", { method: "POST", body: JSON.stringify(run) }))).status, 401);
  assert.equal((await relay.POST(new Request("https://ingest.invalid", { method: "POST", body: JSON.stringify(run), headers: { authorization: `Bearer ${"o".repeat(40)}` } }))).status, 200);
  globalThis.fetch = async () => { throw new Error("timeout"); };
  assert.equal((await relay.POST(new Request("https://ingest.invalid", { method: "POST", body: JSON.stringify(run), headers: { authorization: `Bearer ${"o".repeat(40)}` } }))).status, 502);
} finally { globalThis.fetch = previousFetch; }
console.log("PASS: payload boundaries, credential gate, disabled-district gate, draft/publication validation");

// Disposable embedded PostgreSQL. Install @electric-sql/pglite in a temp prefix,
// then set PGLITE_MODULE to its absolute module path when not available normally.
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create table nrcs_staff_profiles(id uuid primary key, role text, active boolean);
    create table nrcs_districts(district_key text primary key,enabled boolean);
    insert into nrcs_districts values('dlpc',true),('other',true);
    insert into nrcs_staff_profiles values('eeeeeeee-0000-4000-8000-000000000001','editor',true),('eeeeeeee-0000-4000-8000-000000000002','contributor',true);
    create function nrcs_has_role(r text) returns boolean language sql stable security definer as $$ select exists(select 1 from nrcs_staff_profiles where id=auth.uid() and active and (role=r or role='editor' and r='contributor')) $$;
    create function nrcs_can_access_district(d text) returns boolean language sql stable as $$ select d='dlpc' and auth.uid() is not null $$;
    create function nrcs_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
    grant usage on schema public,auth to authenticated,service_role,anon;
  `);
  await db.exec(readFileSync("supabase/nrcs/migrations/20260825000200_phase_2_calendar_foundation.sql", "utf8"));
  await db.exec(readFileSync("supabase/nrcs/migrations/20260923000100_calendar_ingestion_foundation.sql", "utf8"));
  await db.exec(readFileSync("supabase/nrcs/migrations/20260923000200_calendar_seed_sources.sql", "utf8"));
  assert.equal((await db.query("select count(*)::int as n from nrcs_calendar_sources where not enabled")).rows[0].n, 7);
  await db.exec(`update nrcs_calendar_sources set enabled=true where id='${run.source_id}';`);
  const receive = r => db.query("select nrcs_receive_calendar_run($1::jsonb,$2) as result", [JSON.stringify(r), ingestion.hashJson(r)]);
  assert.equal((await receive(valid)).rows[0].result.new_candidates, 1);
  assert.equal((await receive(valid)).rows[0].result.replayed, true);
  await assert.rejects(() => receive({ ...valid, error_message: "changed" }), /different content/);
  const candidate = (await db.query("select id from nrcs_calendar_candidates")).rows[0].id;
  const review = (id, action) => db.query("select nrcs_review_calendar_candidate($1,$2) as id", [id, action]);
  await db.exec("set role authenticated; set test.uid='eeeeeeee-0000-4000-8000-000000000002';");
  await assert.rejects(() => review(candidate, "approve"), /permission denied/);
  await assert.rejects(() => receive(valid), /permission denied/);
  await db.exec("set test.uid='eeeeeeee-0000-4000-8000-000000000001';");
  const event = (await review(candidate, "approve")).rows[0].id;
  assert.ok(event);
  assert.equal((await review(candidate, "approve")).rows[0].id, event);
  await db.exec("reset role;");
  const saved = (await db.query("select * from nrcs_events where id=$1", [event])).rows[0];
  assert.equal(saved.status, "draft"); assert.equal(saved.address, null);
  await assert.rejects(() => db.query("update nrcs_events set status='published' where id=$1", [event]), /Publishing requires/);
  await db.query("update nrcs_events set status='archived' where id=$1", [event]);
  const changed = ingestion.validateCalendarRun({ ...run, run_id: "a0000000-0000-4000-8000-000000000002", candidates: [{ ...run.candidates[0], fields: { title: "Changed title" } }] });
  await receive(changed);
  const updateId = (await db.query("select id from nrcs_calendar_candidates where candidate_type='update'")).rows[0].id;
  await db.exec("set role authenticated;"); await review(updateId, "approve"); await db.exec("reset role;");
  assert.equal((await db.query("select status from nrcs_events where id=$1", [event])).rows[0].status, "archived");
  await db.exec("set role authenticated;"); await review(updateId, "reject"); await db.exec("reset role;");
  assert.equal((await db.query("select expires_at-reviewed_at=interval '90 days' as retained from nrcs_calendar_candidates where id=$1", [updateId])).rows[0].retained, true);
  assert.equal((await receive({ ...changed, run_id: "a0000000-0000-4000-8000-000000000003" })).rows[0].result.new_candidates, 0);
  await db.exec(`update nrcs_calendar_sources set enabled=false where id='${run.source_id}'`);
  await assert.rejects(() => receive({ ...valid, run_id: "a0000000-0000-4000-8000-000000000004" }), /disabled/);
  await db.exec(`create table events(id uuid primary key, nrcs_source_id uuid unique, district_key text, status text);
    insert into events values('${event}','${event}','dlpc','published');`);
  await db.exec(readFileSync("supabase/migrations/20260923000100_calendar_draft_visibility.sql", "utf8"));
  await db.query("select hide_nrcs_event($1,'dlpc','draft')", [event]);
  assert.equal((await db.query("select status from events where id=$1", [event])).rows[0].status, "draft");
  const none = (await db.query("select hide_nrcs_event($1,'dlpc','draft') as result", [run.run_id])).rows[0].result;
  assert.equal(none.id, null);
  await assert.rejects(() => db.query("select hide_nrcs_event($1,'other','draft')", [event]), /identity conflict/);
  await db.query("insert into events values($1,null,'dlpc','published')", [run.run_id]);
  await db.query("select hide_nrcs_event($1,'dlpc','archived',$2)", [changed.run_id, run.run_id]);
  assert.equal((await db.query("select nrcs_source_id,status from events where id=$1", [run.run_id])).rows[0].nrcs_source_id, changed.run_id);
  assert.equal((await db.query("select status from events where id=$1", [run.run_id])).rows[0].status, "archived");
  await assert.rejects(() => db.query("select hide_nrcs_event($1,'dlpc','draft',$2)", [run.source_id, run.run_id]), /already linked/);
  console.log("PASS: migrations, seed records, retry idempotency, permissions, draft approval, publication completeness, archived-event protection, rejection suppression, CMS hide behavior");
} finally { await db.close(); }
