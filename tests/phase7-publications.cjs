const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(name => name in mocks ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}
const contract = load("apps/nrcs/lib/editorialContract.ts");
const id = "f7000000-0000-0000-0000-000000000001";
const source = "f7000000-0000-0000-0000-000000000002";
const envelope = { schema_version: 1, request_id: id, source_id: source, district_key: "dlpc", revision: 1, kind: "web", payload: { story_id: source, copy_version_id: null, title: "Test", body_html: "<p>Body</p>", tease: "Tease", slug: null, status: "draft", scheduled_at: null, published_at: null, seo_title: null, seo_description: null, category: null, tags: [], hero: null, article_media: [], video: null } };
assert.deepEqual(contract.validatePublication(envelope), envelope);
assert.throws(() => contract.validatePublication({ ...envelope, notes: "private" }), /Unsupported/);
assert.throws(() => contract.validatePublication({ ...envelope, payload: { ...envelope.payload, source_documents: [] } }), /Unsupported/);
assert.throws(() => contract.validatePublication({ ...envelope, payload: { ...envelope.payload, status: "published" } }), /Incomplete/);
assert.throws(() => contract.validatePublication({ ...envelope, district_key: "DLPC" }), /district/);
assert.equal(contract.canonicalPublication(envelope), contract.canonicalPublication({ ...envelope, request_id: source }));
const helper = load("lib/nrcsPublication.ts", { "@/apps/nrcs/lib/editorialContract": contract });
assert.equal(helper.sanitizePublicationHtml('<p onclick="bad()">Safe<script>bad()</script><a href="javascript:bad()">Link</a></p>'), '<p>Safe<a target="_blank" rel="noopener noreferrer">Link</a></p>');
const hash = helper.publicationHash(envelope);
const receipt = { schema_version: 1, request_id: id, kind: "web", source_id: source, district_key: "dlpc", revision: 1, content_hash: hash, state: "received_non_public", cms_projection_id: source, cms_article_id: null, public_url: null, published_at: null, received_at: "2026-09-17T17:00:00Z", current_projection_revision: 1 };
assert.deepEqual(contract.verifyPublicationReceipt(receipt, envelope, hash), receipt);
const draftReceipt = { ...receipt, state: "draft", cms_article_id: source };
assert.deepEqual(contract.verifyPublicationReceipt(draftReceipt, envelope, hash, true), draftReceipt);
assert.throws(() => contract.verifyPublicationReceipt(draftReceipt, envelope, hash), /mismatched/);
const homeEnvelope = { ...envelope, kind: "homepage", source_id: "dlpc", payload: { timezone: "America/Chicago", hero_output_id: null, top_output_ids: [], daily: null } };
const appliedReceipt = { ...receipt, kind: "homepage", source_id: "dlpc", state: "applied", public_url: "https://example.invalid/" };
assert.deepEqual(contract.verifyPublicationReceipt(appliedReceipt, homeEnvelope, hash, true), appliedReceipt);
assert.throws(() => contract.verifyPublicationReceipt(appliedReceipt, homeEnvelope, hash), /mismatched/);
assert.throws(() => contract.verifyPublicationReceipt({ ...draftReceipt, state: "published", public_url: "https://example.invalid/stories/test", published_at: receipt.received_at }, envelope, hash, true), /unexpected/);
for (const changed of [{ district_key: "other" }, { public_url: "https://example.invalid/story" }, { content_hash: "wrong" }, { state: "published" }, { current_projection_revision: 0 }]) assert.throws(() => contract.verifyPublicationReceipt({ ...receipt, ...changed }, envelope, hash), /mismatched/);
process.env.CMS_NRCS_API_SECRET = "fixture-only-secret";
assert.equal(helper.authorizeNrcsService(new Request("https://example.invalid", { headers: { Authorization: "Bearer fixture-only-secret" } })), true);
assert.equal(helper.authorizeNrcsService(new Request("https://example.invalid", { headers: { Authorization: "Bearer wrong" } })), false);
const transport = load("apps/nrcs/lib/publicationDelivery.ts", { "server-only": {}, "./editorialContract": contract, "./server": {}, "./districts": {}, "./richText": {}, "./env": { getNrcsCmsApiEnv: () => ({ baseUrl: "https://example.invalid", secret: "fixture" }) } });
const originalFetch = global.fetch;
(async () => {
  try {
    global.fetch = async (_url, options) => { assert.equal(options.redirect, "manual"); assert.ok(options.signal); return Response.json({ ok: true, receipt }); };
    assert.deepEqual(await transport.transmitPublication(envelope, hash), receipt);
    global.fetch = async () => new Response(null, { status: 308, headers: { Location: "https://other.invalid" } });
    await assert.rejects(transport.transmitPublication(envelope, hash), /redirected/);
    global.fetch = async () => Response.json({ ok: true, receipt: { ...receipt, source_id: id } });
    await assert.rejects(transport.transmitPublication(envelope, hash), /mismatched/);
    global.fetch = async () => Response.json({ error: "Unauthorized" }, { status: 401 });
    await assert.rejects(transport.transmitPublication(envelope, hash), /Unauthorized/);
    global.fetch = async () => { throw new DOMException("Timeout", "TimeoutError"); };
    await assert.rejects(transport.transmitPublication(envelope, hash), /Timeout/);
    let staff = null, calls = 0;
    const api = load("apps/nrcs/app/api/publications/route.ts", {
      "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
      "@/lib/auth": { getCurrentNrcsStaff: async () => staff },
      "@/lib/districts": { getNrcsDistrictContext: async () => ({ allowedDistricts: [{ district_key: "dlpc" }] }) },
      "@/lib/publicationDelivery": { getDelivery: async () => null, sendPublication: async () => { calls++; return { status: "received", receipt }; } },
    });
    const post = (body = { kind: "web", source_id: source, district_key: "dlpc", revision: 1 }) => api.POST(new Request("https://example.invalid/api/publications", { method: "POST", body: JSON.stringify(body) }));
    assert.equal((await post()).status, 401);
    staff = { profile: { role: "contributor" } };
    assert.equal((await post()).status, 403);
    staff = { profile: { role: "editor" } };
    assert.equal((await post({ kind: "web", source_id: source, district_key: "other", revision: 1 })).status, 403);
    assert.equal((await post({ kind: "web", source_id: source, district_key: "dlpc", revision: 0 })).status, 400);
    assert.equal(calls, 0);
    assert.equal((await post()).status, 200);
    assert.equal(calls, 1);
    let liveMode = false, receivingKind;
    const receive = load("app/api/nrcs/publications/route.ts", {
      "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
      "@/lib/nrcsPublication": helper,
      "@/lib/editorialFeatureFlag": { nrcsPublishingEnabled: () => liveMode },
      "@/apps/nrcs/lib/editorialContract": contract,
      "@/lib/supabase/admin": { createServiceClient: () => ({ from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { subdomain: "dlpc.example.invalid" }, error: null }) }), rpc: async (name, args) => { receivingKind = name; const e = args.p_package; return { data: liveMode ? { ...receipt, request_id: e.request_id, kind: e.kind, source_id: e.source_id, content_hash: args.p_hash, state: e.kind === "web" ? "draft" : "applied", cms_article_id: e.kind === "web" ? source : null, public_url: e.kind === "web" ? null : "/" } : receipt, error: null }; } }) },
    });
    const receivePost = (body, token = "fixture-only-secret") => receive.POST(new Request("https://example.invalid/api/nrcs/publications", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
    assert.equal((await receivePost(envelope, "wrong")).status, 401);
    assert.equal((await receivePost({ ...envelope, private_notes: "secret" })).status, 400);
    assert.equal((await receivePost(envelope)).status, 200);
    assert.equal(receivingKind, "receive_nrcs_publication", "Disabled flag must retain private receiving");
    liveMode = true;
    assert.equal((await receivePost(envelope)).status, 200);
    assert.equal(receivingKind, "receive_nrcs_web_publication");
    const appliedHome = await receivePost(homeEnvelope);
    assert.equal(appliedHome.status, 200);
    assert.equal((await appliedHome.json()).receipt.public_url, "https://dlpc.example.invalid/");
    assert.equal(receivingKind, "receive_nrcs_homepage_publication");
    const alertEnvelope = { ...envelope, kind: "alert", payload: { headline: "Test", message: "Message", active: false, start_at: null, end_at: null, target_type: "none", target_id: null, external_url: null } };
    assert.equal((await receivePost(alertEnvelope)).status, 200);
    assert.equal(receivingKind, "receive_nrcs_alert_publication");
    liveMode = false;
    let saved = { ...envelope, content_hash: hash, package: envelope, status: "failed", attempts: 0, lease_until: null, receipt: null, last_error: "Previous failure" };
    const rlsQuery = () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: saved, error: null }) });
    const serviceQuery = () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: saved, error: null }), maybeSingle: async () => ({ data: { request_id: id }, error: null }), update(changes) { saved = { ...saved, ...changes }; return this; }, upsert() { throw new Error("Retry rebuilt the snapshot"); } });
    const retry = load("apps/nrcs/lib/publicationDelivery.ts", { "server-only": {}, "./editorialContract": contract, "./richText": {}, "./districts": { getNrcsDistrictContext: () => { throw new Error("Retry rebuilt dependencies"); } }, "./env": { getNrcsCmsApiEnv: () => ({ baseUrl: "https://example.invalid", secret: "fixture" }) }, "./server": { createNrcsServerClient: async () => ({ from: rlsQuery }), createNrcsServiceClient: () => ({ from: serviceQuery, rpc: async () => ({ data: { ...saved, attempts: 1 }, error: null }) }) } });
    global.fetch = async (_url, options) => { assert.equal(JSON.parse(options.body).request_id, id); return Response.json({ ok: true, receipt }); };
    assert.equal((await retry.sendPublication("web", source, "dlpc", 1)).status, "received");
    let streamKind = "web", streamStory = source;
    const streamId = "f7000000-0000-0000-0000-000000000003";
    const queried = [];
    const builder = load("apps/nrcs/lib/publicationDelivery.ts", {
      "server-only": {}, "./editorialContract": contract, "./env": {},
      "./richText": { sanitizeRichTextHtml: helper.sanitizePublicationHtml },
      "./districts": { getNrcsDistrictContext: async () => ({ allowedDistricts: [{ district_key: "dlpc", timezone: "America/Chicago" }] }) },
      "./server": { createNrcsServerClient: async () => ({ from(table) {
        const result = () => ({ data: table === "nrcs_web_outputs" ? { ...envelope.payload, id: source, story_id: source, district_key: "dlpc", revision: 1, copy_version_id: id, hero_asset_id: null, video_asset_id: null } : table === "nrcs_stories" ? { id: source, title: "Test", district_key: "dlpc", nrcs_categories: null } : table === "nrcs_copy_versions" ? { id, stream_id: streamId, headline: "Exact version", body_html: "<p>Body</p>" } : table === "nrcs_copy_streams" ? { story_id: streamStory, stream_type: streamKind } : [], error: null });
        return { select(columns) { assert.ok(!columns.includes("nrcs_copy_streams!")); return this; }, eq(column, value) { queried.push([table, column, value]); return this; }, order() { return this; }, single: async () => result(), maybeSingle: async () => result(), then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } };
      } }) },
    });
    const built = await builder.buildPublication("web", source, "dlpc", 1);
    assert.equal(built.payload.copy_version_id, id);
    assert.equal(built.payload.title, "Exact version");
    assert.ok(queried.some(([table, column, value]) => table === "nrcs_copy_streams" && column === "id" && value === streamId));
    streamKind = "rundown";
    await assert.rejects(builder.buildPublication("web", source, "dlpc", 1), /Web Copy/);
    streamKind = "web"; streamStory = id;
    await assert.rejects(builder.buildPublication("web", source, "dlpc", 1), /Web Copy/);
    console.log("Phase 7 package, sanitization, authorization, receipt and transport checks passed.");
  } finally { global.fetch = originalFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
