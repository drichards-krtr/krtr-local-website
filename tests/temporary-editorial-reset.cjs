const assert = require("node:assert/strict");
const fs = require("node:fs");
const sql = fs.readFileSync("supabase/nrcs/migrations/20260918000200_temporary_editorial_reset.sql", "utf8");
const scope = sql.match(/tables text\[\] := array\[([\s\S]*?)\];/)[1];
const tables = [...scope.matchAll(/'(nrcs_[a-z_]+)'/g)].map(match => match[1]);
assert.equal(new Set(tables).size, tables.length);
for (const preserved of ["nrcs_school_identities", "nrcs_district_schools", "nrcs_staff_profiles", "nrcs_districts", "nrcs_programs", "nrcs_program_templates", "nrcs_tags", "nrcs_categories", "nrcs_permission_audit_events"]) {
  assert.ok(!tables.includes(preserved), preserved);
}
for (const deleted of ["nrcs_sources", "nrcs_source_documents", "nrcs_assets", "nrcs_stories", "nrcs_events", "nrcs_editions", "nrcs_intake_items"]) assert.ok(tables.includes(deleted), deleted);
for (const [child, parent] of [["nrcs_homepage_lineups", "nrcs_web_outputs"], ["nrcs_social_outputs", "nrcs_stories"], ["nrcs_web_outputs", "nrcs_copy_versions"], ["nrcs_rundown_items", "nrcs_editions"], ["nrcs_source_documents", "nrcs_sources"]]) assert.ok(tables.indexOf(child) < tables.indexOf(parent));
assert.match(sql, /if not public\.nrcs_has_role\('admin'\)/);
assert.match(sql, /if p_confirmation is not null then\s+execute format\('delete/);
assert.match(sql, /s\.logo_url = nrcs_assets\.cloudinary_url/);
assert.match(sql, /not like 'krtr\/schools\/%'/);
assert.match(sql, /revoke all .* from public, anon/);
assert.doesNotMatch(sql, /truncate|disable trigger/i);
console.log("Temporary reset scope/security contract checks passed (static; not database execution).");
