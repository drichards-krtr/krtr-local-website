const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, mocks = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${js}})`, { filename: file })(name => name in mocks ? mocks[name] : name.startsWith("@/") ? {} : require(name), module, module.exports);
  return module.exports;
}
const id = "f9200000-0000-0000-0000-000000000001";
const description = load("lib/storyDescription.ts");
assert.equal(description.htmlToDescription("<p>First <b>word</b>.</p><p>Second &amp; &#x1F600;.</p><script>secret()</script>"), "First word. Second & \u{1F600}.");
assert.equal(description.htmlToDescription("<p>he<b>llo</b></p>"), "hello");
assert.equal(description.htmlToDescription(null), null);
let user = null, admin = false, authority = true, environment = true, target = true, requests = 0;
const filters = [];
const service = { from(table) {
  let update = false;
  return { select() { return this; }, abortSignal(signal) { assert.ok(signal); return this; }, eq(column, value) { filters.push([table, column, value]); return this; }, is(column, value) { filters.push([table, column, value]); return this; }, update() { update = true; return this; },
    single: async () => ({ data: { legacy_writes_enabled: authority }, error: null }),
    maybeSingle: async () => ({ data: table === "profiles" ? { is_admin: admin } : target ? { id } : null, error: null }),
    then(resolve, reject) { return Promise.resolve({ data: update ? [{ id }] : [], error: null }).then(resolve, reject); },
  };
} };
const auth = { ...service, auth: { getUser: async () => ({ data: { user } }) } };
const guard = load("lib/legacyEditorialWrite.ts", { "server-only": {}, "@/lib/supabase/admin": { createServiceClient: () => service }, "@/lib/editorialFeatureFlag": { legacyEditorialEnabled: () => environment } });
const api = load("app/api/mux/create-upload/route.ts", {
  "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
  "@/lib/supabase/server": { createServerSupabase: async () => auth },
  "@/lib/supabase/admin": { createServiceClient: () => service },
  "@/lib/legacyEditorialWrite": guard,
  "@/lib/districts": { resolveDistrictFromHost: () => "dlpc" },
});
const originalFetch = global.fetch;
const originalWebhookSecret = process.env.MUX_WEBHOOK_SECRET;
const originalEnv = [process.env.MUX_TOKEN_ID, process.env.MUX_TOKEN_SECRET];
(async () => {
  try {
    process.env.MUX_TOKEN_ID = "fixture"; process.env.MUX_TOKEN_SECRET = "fixture";
    global.fetch = async (_url, options) => { requests++; assert.ok(options.signal); return Response.json({ data: { id: "upload", url: "https://fixture.invalid/upload" } }); };
    const post = body => api.POST(new Request("https://www.krtrlocal.tv/api/mux/create-upload", { method: "POST", headers: { host: "www.krtrlocal.tv" }, body: JSON.stringify(body || { storyId: id }) }));
    assert.equal((await post()).status, 401);
    user = { id };
    assert.equal((await post()).status, 403);
    admin = true; authority = false;
    assert.equal((await post()).status, 403);
    authority = true; environment = false;
    assert.equal((await post()).status, 403);
    environment = true; target = false;
    assert.equal((await post()).status, 404);
    target = true;
    assert.equal((await post({ storyId: id, dailyId: id })).status, 400);
    assert.equal(requests, 0, "Rejected uploads must never contact Mux");
    assert.equal((await post()).status, 200);
    assert.equal(requests, 1);
    assert.ok(filters.some(([table, column, value]) => table === "stories" && column === "district_key" && value === "dlpc"));
    assert.ok(filters.some(([table, column, value]) => table === "stories" && column === "editorial_origin" && value === "cms"));
    let media = { id, district_key: "dlpc", mux_upload_id: "old", mux_asset_id: null, mux_playback_id: null, mux_status: "none", editorial_origin: "nrcs", nrcs_edition_id: id };
    const mux = load("lib/mux.ts", { "@/lib/supabase/admin": { createServiceClient: () => ({ from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: media, error: null }), update() { throw new Error("NRCS-owned media must never be refreshed by legacy code"); } }) }) } });
    await mux.syncStoryVideoState(id); await mux.syncDailyVideoState(id);
    assert.equal(requests, 1, "NRCS media reads must not contact legacy Mux");
    const callbackFilters = [];
    const webhook = load("app/api/mux/webhook/route.ts", {
      "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
      "@/lib/supabase/admin": { createServiceClient: () => ({ from(table) { return {
        update() { return this; }, select() { return this; }, eq(column, value) { callbackFilters.push([table, column, value]); return this; }, is(column, value) { callbackFilters.push([table, column, value]); return this; },
        then(resolve, reject) { return Promise.resolve({ data: [{ id }], error: null }).then(resolve, reject); },
      }; } }) },
    });
    process.env.MUX_WEBHOOK_SECRET = "fixture-webhook-secret";
    for (const passthrough of [id, `daily:${id}`]) {
      const payload = JSON.stringify({ type: "video.upload.asset_created", data: { id: "old-upload", asset_id: "old-asset", passthrough } });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = require("node:crypto").createHmac("sha256", process.env.MUX_WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest("hex");
      assert.equal((await webhook.POST(new Request("https://fixture.invalid/api/mux/webhook", { method: "POST", headers: { "mux-signature": `t=${timestamp},v1=${signature}` }, body: payload }))).status, 200);
    }
    assert.ok(callbackFilters.some(([table, column, value]) => table === "stories" && column === "editorial_origin" && value === "cms"));
    assert.ok(callbackFilters.some(([table, column, value]) => table === "dailys" && column === "nrcs_edition_id" && value === null));
    const article = { id, slug: "test", title: "Title", tease: null, body_html: "<p>HTML description &amp; facts.</p>", body_markdown: "Obsolete description", editorial_origin: "nrcs", seo_title: "SEO title", seo_description: null, image_url: null, mux_playback_id: null };
    const page = load("app/(public)/stories/[id]/page.tsx", { "@/lib/public-stories": { getPublishedStoryByIdOrSlug: async () => article }, "@/lib/districtServer": { getCurrentDistrictKey: async () => "dlpc" }, "@/lib/metadata": { buildPageMetadata: input => input, markdownToDescription: value => value }, "@/lib/storyDescription": description });
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: "test" }) });
    assert.equal(metadata.title, "SEO title"); assert.equal(metadata.description, "HTML description & facts.");
    const feed = load("app/feed.xml/route.ts", {
      "@/lib/storyDescription": description,
      "@/lib/districtServer": { getCurrentDistrict: async () => ({ key: "dlpc", metadata: { defaultDescription: "Default", siteName: "KRTR" } }) },
      "@/lib/metadata": { absoluteUrl: async path => `https://fixture.invalid${path}`, markdownToDescription: value => value },
      "@/lib/supabase/public": { createPublicClient: () => ({ from: () => ({ select() { return this; }, eq() { return this; }, or() { return this; }, order() { return this; }, limit: async () => ({ data: [article], error: null }) }) }) },
    });
    assert.match(await (await feed.GET()).text(), /HTML description &amp; facts\./);
    let sent;
    const event = load("apps/nrcs/lib/eventSyncServer.ts", { "./server": { createNrcsServiceClient: () => ({ from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { id, cms_event_id: id, district_key: "dlpc" }, error: null }) }) }) }, "./cmsSync": { syncEventToCms: async payload => { sent = payload; return { ok: true }; } } });
    await event.syncNrcsEventById(id); assert.equal(sent.cms_event_id, id);
    console.log("Cutover API auth/authority/district denial, Mux ownership, Event linkage, HTML/SEO/feed regression checks passed.");
  } finally {
    global.fetch = originalFetch;
    if (originalWebhookSecret === undefined) delete process.env.MUX_WEBHOOK_SECRET; else process.env.MUX_WEBHOOK_SECRET = originalWebhookSecret;
    for (const [index, key] of ["MUX_TOKEN_ID", "MUX_TOKEN_SECRET"].entries()) { if (originalEnv[index] === undefined) delete process.env[key]; else process.env[key] = originalEnv[index]; }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
