const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(name => name in mocks ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}
const richText = load("apps/nrcs/lib/richText.ts");
const markdown = load("lib/legacyMarkdown.ts", { "./nrcsPublication": { sanitizePublicationHtml: richText.sanitizeRichTextHtml } });
const uuid = number => `f7000000-0000-0000-0000-${String(number).padStart(12, "0")}`;
const records = {
  event_classification_terms: Array.from({ length: 12 }, (_, index) => ({ id: uuid(index + 1), district_key: "dlpc", name: `Sport ${index}`, kind: "sport", enabled: true })),
  profiles: [{ id: uuid(100), email: "editor@example.test" }],
  stories: [{ id: uuid(200), district_key: "dlpc", title: "Story", created_by: uuid(100), body_markdown: "# Headline\n\n**Copy**", tags: ["dysart"], submitter_id: uuid(300) }],
  story_submitters: [{ id: uuid(300), name: "Private contact", email: "private@example.test", submitted_story_id: uuid(200) }],
  events: [], event_submitters: [], event_classification_assignments: [], story_slots: [],
};
class Query {
  constructor(table) { this.rows = structuredClone(records[table] || []); this.max = Infinity; }
  select() { return this; }
  eq(key, value) { this.rows = this.rows.filter(row => row[key] === value); return this; }
  gt(key, value) { this.rows = this.rows.filter(row => row[key] > value); return this; }
  in(key, values) { this.rows = this.rows.filter(row => values.includes(row[key])); return this; }
  order(key) { this.rows.sort((a, b) => String(a[key]).localeCompare(String(b[key]))); return this; }
  limit(max) { this.max = max; return this; }
  then(resolve, reject) { return Promise.resolve({ data: this.rows.slice(0, this.max), count: this.rows.length, error: null }).then(resolve, reject); }
}
const exporter = load("app/api/nrcs/migration-export/route.ts", {
  "@/lib/nrcsPublication": { authorizeNrcsService: request => request.headers.get("authorization") === "Bearer fixture" },
  "@/lib/legacyMarkdown": markdown,
  "@/lib/tags": { getTagBySlug: () => ({ label: "Dysart" }), getTagTree: () => [{ slug: "dysart", label: "Dysart", children: [{ slug: "child", label: "Child" }] }] },
  "@/lib/supabase/admin": { createServiceClient: () => ({ from: table => new Query(table), rpc: async () => ({ data: { unassigned_story_submitters: 0 }, error: null }) }) },
});
const migration = load("apps/nrcs/lib/migration.ts", { "./richText": richText, "./mux": { getMuxCredentials: () => null }, "./env": { getNrcsCmsApiEnv: () => ({ baseUrl: "https://cms.example", secret: "fixture" }) } });
let staff = null;
const runner = load("apps/nrcs/app/api/migrations/route.ts", { "@/lib/auth": { getCurrentNrcsStaff: async () => staff }, "@/lib/server": { createNrcsServerClient: async () => { throw new Error("Database must not be reached without authorization"); } }, "@/lib/migration": migration });
(async () => {
  const oldFetch = global.fetch;
  try {
    assert.equal((await exporter.GET(new Request("https://cms.example/api/nrcs/migration-export?kind=stories&district=dlpc"))).status, 401);
    global.fetch = (url, options) => exporter.GET(new Request(url, options));
    const first = await migration.fetchLegacy("terms", "dlpc");
    assert.equal((await migration.fetchLegacy("tags", "dlpc")).rows.length, 2);
    assert.equal(first.rows.length, 10); assert.equal(first.remaining, 12); assert.equal(first.next, uuid(10));
    const second = await migration.fetchLegacy("terms", "dlpc", first.next);
    assert.equal(second.rows.length, 2); assert.equal(second.next, null);
    assert.equal((await migration.fetchLegacy("terms", "vs")).rows.length, 0);
    const story = (await migration.fetchLegacy("stories", "dlpc", null, uuid(200))).rows[0];
    assert.equal(story.submitters.length, 1, "Reciprocal links must not duplicate submitters");
    assert.equal(story.author.email, "editor@example.test");
    assert.match(story.converted_html, /<strong>Copy<\/strong>/);
    assert.equal((await migration.fetchLegacy("slots", "dlpc")).rows[0].slots.length, 0);
    assert.equal((await runner.GET(new Request("https://nrcs.example/api/migrations"))).status, 401);
    staff = { profile: { role: "contributor" } };
    assert.equal((await runner.GET(new Request("https://nrcs.example/api/migrations"))).status, 403);
    assert.equal((await runner.POST(new Request("https://nrcs.example/api/migrations", { method: "POST", body: JSON.stringify({ action: "start", district: "dlpc" }) }))).status, 403);
    global.fetch = async () => Response.json({ schema_version: 1, kind: "stories", district_key: "vs", rows: [] });
    await assert.rejects(migration.fetchLegacy("stories", "dlpc"), /identity mismatch/);
    global.fetch = async () => new Response(null, { status: 308, headers: { location: "https://other.example" } });
    await assert.rejects(migration.fetchLegacy("stories", "dlpc"), /redirected/);
    console.log("Phase 8 export pagination, district boundaries, copy conversion, submitter deduplication, API authorization and response verification checks passed.");
  } finally { global.fetch = oldFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
