import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { authDestination } from "../lib/redirects.mjs";
import { validStaffScope } from "../lib/roles.mjs";

const ids = Object.fromEntries(["owner", "district", "regional", "seller", "agent", "customer", "otherCustomer", "inactive"].map((key, i) => [key, `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`]));
const regionA = "10000000-0000-4000-8000-000000000001";
const regionB = "10000000-0000-4000-8000-000000000002";
const companyA = "20000000-0000-4000-8000-000000000001";
const companyB = "20000000-0000-4000-8000-000000000002";

async function asUser(db, user, callback, role = "authenticated") {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user || ""]);
    return await callback();
  } finally { await db.exec("rollback"); }
}

test("authentication redirects reject outside destinations", () => {
  for (const destination of ["https://attacker.invalid", "//attacker.invalid", "/settings/access", "/\\attacker.invalid", null]) assert.equal(authDestination(destination), "/dashboard");
  assert.equal(authDestination("/update-password"), "/update-password");
});
test("staff grants require the correct scope type", () => {
  assert.equal(validStaffScope("regional_manager", null, regionA), true);
  assert.equal(validStaffScope("regional_manager", "dlpc", null), false);
  assert.equal(validStaffScope("district_manager", "dlpc", regionA), false);
  assert.equal(validStaffScope("salesperson", "dlpc", null), true);
  assert.equal(validStaffScope("production_agent", "dlpc", null), true);
  assert.equal(validStaffScope("owner", "dlpc", null), false);
});

test("Sales migration executes with enforced PostgreSQL role policies", async t => {
  const db = new PGlite();
  try {
    // Minimal Supabase Auth API emulation; the actual migration and RLS execute in PostgreSQL.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; grant usage on schema auth to authenticated, anon;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant execute on function auth.uid() to authenticated, anon;`);
    const migration = await readFile(new URL("../supabase/migrations/20261012000100_sales_foundation.sql", import.meta.url), "utf8");
    await db.exec(migration);
    assert.deepEqual((await db.query("select district_key from sales_districts")).rows, [{ district_key: "dlpc" }]);
    assert.equal((await db.query("select * from sales_regions")).rows.length, 0);
    assert.equal((await db.query("select * from sales_studios")).rows.length, 0);
    const show = (await db.query("select * from sales_shows")).rows[0];
    assert.equal(show.name, "Morning Kickstart"); assert.equal(show.publishes_on_holidays, true); assert.equal(show.publication_time, "05:00:00");
    for (const id of Object.values(ids)) await db.query("insert into auth.users(id, raw_user_meta_data) values($1, $2)", [id, JSON.stringify({ role: "owner", active: true })]);
    assert.equal((await db.query("select active from sales_profiles where id=$1", [ids.owner])).rows[0].active, false);
    await db.query("update sales_profiles set active=true where id<>$1", [ids.inactive]);
    await db.query("insert into sales_owner(user_id) values($1)", [ids.owner]);
    await db.query("insert into sales_regions(id,name) values($1,'Test A'),($2,'Test B')", [regionA, regionB]);
    await db.query("update sales_districts set region_id=$1 where district_key='dlpc'", [regionA]);
    await db.query("insert into sales_districts(district_key,name,region_id) values('test-b','Test district',$1)", [regionB]);
    for (const [key, role] of [["district", "district_manager"], ["seller", "salesperson"], ["agent", "production_agent"], ["inactive", "district_manager"]]) {
      await db.query("insert into sales_staff_scopes(user_id,role,district_key) values($1,$2,'dlpc')", [ids[key], role]);
    }
    await db.query("insert into sales_staff_scopes(user_id,role,region_id) values($1,'regional_manager',$2)", [ids.regional, regionA]);
    await db.query("insert into sales_organizations(id,company_name,salesperson_id) values($1,'Company A',$2),($3,'Company B',null)", [companyA, ids.seller, companyB]);
    await db.query("insert into sales_organization_districts values($1,'dlpc',now()),($2,'test-b',now())", [companyA, companyB]);
    await db.query("insert into sales_organization_members(organization_id,user_id,can_sign_agreements) values($1,$2,true),($3,$4,false)", [companyA, ids.customer, companyB, ids.otherCustomer]);

    await t.test("anonymous cannot read private Sales tables or invoke helpers", async () => {
      await assert.rejects(asUser(db, null, () => db.query("select * from sales_districts"), "anon"), /permission denied/);
      await assert.rejects(asUser(db, null, () => db.query("select sales_private.is_owner()"), "anon"), /permission denied/);
    });
    await t.test("owner sees all districts and can configure regions", async () => {
      await asUser(db, ids.owner, async () => {
        assert.equal((await db.query("select * from sales_districts")).rows.length, 2);
        assert.equal((await db.query("insert into sales_regions(name) values('Owner region') returning id")).rows.length, 1);
      });
    });
    await t.test("district and regional managers have only their current scope", async () => {
      for (const key of ["district", "regional"]) await asUser(db, ids[key], async () => {
        assert.deepEqual((await db.query("select district_key from sales_districts")).rows, [{ district_key: "dlpc" }]);
        assert.equal((await db.query("select sales_private.can_manage_district('test-b') allowed")).rows[0].allowed, false);
        assert.equal((await db.query("select sales_private.can_manage_district('dlpc') allowed")).rows[0].allowed, true);
        assert.equal((await db.query("select * from sales_organizations")).rows.length, 1);
      });
      await assert.rejects(asUser(db, ids.regional, () => db.query("insert into sales_regions(name) values('Unauthorized')")), /row-level security/);
      await asUser(db, ids.district, async () => {
        assert.equal((await db.query("update sales_districts set region_id=null where district_key='dlpc' returning district_key")).rows.length, 0);
      });
    });
    await t.test("cross-district company membership does not widen manager access", async () => {
      await db.query("insert into sales_organization_districts(organization_id,district_key) values($1,'test-b')", [companyA]);
      await asUser(db, ids.district, async () => {
        assert.deepEqual((await db.query("select district_key from sales_organization_districts where organization_id=$1", [companyA])).rows, [{ district_key: "dlpc" }]);
      });
      await asUser(db, ids.customer, async () => {
        assert.equal((await db.query("select district_key from sales_organization_districts where organization_id=$1", [companyA])).rows.length, 2);
      });
      await db.query("delete from sales_organization_districts where organization_id=$1 and district_key='test-b'", [companyA]);
    });
    await t.test("regional reassignment recomputes access immediately and is audited", async () => {
      await db.query("update sales_districts set region_id=$1 where district_key='dlpc'", [regionB]);
      await asUser(db, ids.regional, async () => { assert.equal((await db.query("select * from sales_districts")).rows.length, 0); });
      const audit = await db.query("select * from sales_audit_events where table_name='sales_districts' and operation='UPDATE' order by id desc limit 1");
      assert.equal(audit.rows[0].before_record.region_id, regionA); assert.equal(audit.rows[0].after_record.region_id, regionB);
      await db.query("update sales_districts set region_id=$1 where district_key='dlpc'", [regionA]);
    });
    await t.test("seller and production agent cannot gain manager authority", async () => {
      for (const key of ["seller", "agent"]) await asUser(db, ids[key], async () => {
        assert.equal((await db.query("select sales_private.can_manage_district('dlpc') allowed")).rows[0].allowed, false);
        assert.equal((await db.query("select * from sales_districts")).rows.length, 1);
        assert.equal((await db.query("update sales_profiles set active=false where id=auth.uid() returning id")).rows.length, 0);
      });
      await assert.rejects(asUser(db, ids.seller, () => db.query("insert into sales_staff_scopes(user_id,role,district_key) values(auth.uid(),'district_manager','dlpc')")), /row-level security/);
      await asUser(db, ids.agent, async () => { assert.equal((await db.query("select * from sales_organizations")).rows.length, 0); assert.equal((await db.query("select * from sales_organization_members")).rows.length, 0); });
    });
    await t.test("customers cannot cross organizations or gain staff scope", async () => {
      await asUser(db, ids.customer, async () => {
        assert.deepEqual((await db.query("select id from sales_organizations")).rows, [{ id: companyA }]);
        assert.equal((await db.query("select * from sales_districts")).rows.length, 0);
        assert.equal((await db.query("select * from sales_staff_scopes")).rows.length, 0);
        assert.equal((await db.query("update sales_organization_members set can_approve_assets=true where user_id=auth.uid() returning user_id")).rows.length, 0);
      });
    });
    await t.test("inactive identities lose access regardless of assigned scope", async () => {
      await asUser(db, ids.inactive, async () => { assert.equal((await db.query("select * from sales_districts")).rows.length, 0); assert.equal((await db.query("select sales_private.is_owner() allowed")).rows[0].allowed, false); });
      await db.query("update sales_profiles set active=false where id=$1", [ids.seller]);
      await asUser(db, ids.seller, async () => { assert.equal((await db.query("select * from sales_organizations")).rows.length, 0); });
    });
    await t.test("owner identity and audit history cannot be overwritten through API", async () => {
      await assert.rejects(asUser(db, ids.owner, () => db.query("update sales_owner set user_id=$1", [ids.customer])), /permission denied/);
      await assert.rejects(asUser(db, ids.owner, () => db.query("delete from sales_audit_events")), /permission denied/);
      await assert.rejects(asUser(db, ids.owner, () => db.query("update sales_profiles set active=false where id=auth.uid()")), /cannot be deactivated/);
      await asUser(db, ids.owner, async () => {
        await db.query("update sales_regions set name='Audit actor check' where id=$1", [regionA]);
        assert.equal((await db.query("select actor_id from sales_audit_events order by id desc limit 1")).rows[0].actor_id, ids.owner);
      });
    });
    await t.test("invalid grants and cross-district studio assignments fail database constraints", async () => {
      await assert.rejects(db.query("insert into sales_staff_scopes(user_id,role,district_key,region_id) values($1,'regional_manager','dlpc',$2)", [ids.regional, regionA]), /check constraint/);
      const studio = (await db.query("insert into sales_studios(name,district_key) values('Test studio','test-b') returning id")).rows[0].id;
      await assert.rejects(db.query("update sales_shows set studio_id=$1 where district_key='dlpc'", [studio]), /foreign key constraint/);
    });
  } finally { await db.close(); }
});
