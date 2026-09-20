import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = process.cwd();
function loadTs(filename, mocks = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith(".")) return loadTs(path.resolve(path.dirname(filename), name + ".ts"), mocks);
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}
const outputs = loadTs(path.join(root, "lib/outputs.ts"));
assert.deepEqual(outputs.SOCIAL_DESTINATIONS, ["Facebook", "Instagram", "TikTok", "YouTube", "X"]);
assert.deepEqual(outputs.orderedArticleMedia(["a", "b", "a", "hero"], "hero"), ["hero", "a", "b"]);
assert.deepEqual(outputs.orderedArticleMedia(["a", "b"], "hero"), ["a", "b"]);
for (const instant of ["2026-03-09T04:59:59Z", "2026-11-02T05:59:59Z"]) {
  const date = instant.includes("03-") ? "2026-03-08" : "2026-11-01";
  assert.equal(outputs.dailyIsEligible(date, "America/Chicago", new Date(instant)), true);
  assert.equal(outputs.dailyIsEligible(date, "America/Chicago", new Date(new Date(instant).getTime() + 1000)), false);
}
assert.equal(outputs.dailyIsEligible("2026-09-17", "Pacific/Honolulu", new Date("2026-09-18T08:00:00Z")), true);
assert.equal(outputs.alertIsActive({ active: true, start_at: "2026-09-17T17:00:00Z", end_at: "2026-09-17T18:00:00Z" }, new Date("2026-09-17T17:00:00Z")), true);
assert.equal(outputs.alertIsActive({ active: true, start_at: null, end_at: "2026-09-17T18:00:00Z" }, new Date("2026-09-17T18:00:00Z")), false);
assert.equal(outputs.alertIsActive({ active: false, start_at: null, end_at: null }), false);
assert.equal(outputs.isReadyPublicAsset({ asset_type: "video", mux_status: "processing", mux_playback_id: "p" }), false);
const cmsDistricts = loadTs(path.join(root, "lib/cmsDistricts.ts"), { "./env": { getNrcsCmsApiEnv: () => ({ baseUrl: "https://example.invalid", secret: "test-only" }) } });
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, init) => { assert.ok(init.signal instanceof AbortSignal); return Response.json({ ok: true, districts: [] }); };
  assert.deepEqual(await cmsDistricts.getCmsDistricts(), []);
} finally { globalThis.fetch = originalFetch; }
const uid = "f6000000-0000-0000-0000-000000000001";
const storyId = "f6100000-0000-0000-0000-000000000001";
const versionId = "f6200000-0000-0000-0000-000000000001";
let staff = null, calls = [], rpcError = null;
const fakeDb = {
  from(table) {
    const query = { select() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve({ data: { id: storyId, district_key: "dlpc", created_by: uid }, error: null }); }, single() { return Promise.resolve({ data: { id: uid, revision: 1 }, error: null }); } };
    return query;
  },
  async rpc(name, args) { calls.push({ name, args }); return { data: uid, error: rpcError }; },
};
const api = loadTs(path.join(root, "app/api/editorial/[kind]/route.ts"), {
  "next/server": { after: callback => { void callback(); }, NextResponse: { json: (data, options) => Response.json(data, options) } },
  "@/lib/auth": { getCurrentNrcsStaff: async () => staff },
  "@/lib/server": { createNrcsServerClient: async () => fakeDb },
  "@/lib/districts": { getNrcsDistrictContext: async () => ({ allowedDistricts: [{ district_key: "dlpc", timezone: "America/Chicago" }] }) },
  "@/lib/localDates": loadTs(path.join(root, "lib/localDates.ts")),
  "@/lib/graphics": loadTs(path.join(root, "lib/graphics.ts")),
  "@/lib/outputs": outputs,
  "@/lib/stories": { normalizeSlug: value => value.toLowerCase().replace(/\s+/g, "-") },
  "@/lib/cloudinary": { getCloudinaryCredentials: () => ({ cloudName: "fixture" }) },
  "@/lib/publicationDelivery": { queuePublication: async (kind, sourceId, districtKey, revision) => ({ request_id: uid, kind, source_id: sourceId, district_key: districtKey, revision }), processPublicationDelivery: async () => {} },
});
const body = { revision: 0, district_key: "dlpc", story_id: storyId, copy_version_id: versionId, status: "draft", slug: "Test Story", media_ids: [] };
const post = (kind, data = body) => api.POST(new Request(`http://localhost/api/editorial/${kind}`, { method: "POST", body: JSON.stringify(data) }), { params: Promise.resolve({ kind }) });
assert.equal((await post("web")).status, 401);
staff = { profile: { id: uid, role: "contributor" } };
assert.equal((await post("web", { ...body, status: "published" })).status, 403);
assert.equal((await post("homepage")).status, 403);
assert.equal((await post("alert")).status, 403);
assert.equal((await post("edition-media")).status, 403);
assert.equal((await post("web", { ...body, district_key: "other" })).status, 403);
assert.equal((await post("web", { ...body, story_id: "invalid" })).status, 400);
assert.equal((await post("web", { ...body, scheduled_at: "2026-03-08T02:30" })).status, 400);
assert.equal((await post("web", { ...body, scheduled_at: "2026-02-31T12:00" })).status, 400);
assert.equal((await post("web")).status, 200);
assert.equal(calls.at(-1).args.p_output.copy_version_id, versionId);
assert.equal(calls.at(-1).args.p_output.slug, "test-story");
rpcError = { message: "Output changed. Reload before saving" };
assert.equal((await post("web", { ...body, revision: 1 })).status, 409);
rpcError = null;
console.log("Phase 6 model/timezone/API boundary checks passed.");
if (process.argv.includes("--unit")) process.exit(0);

const runtime = process.env.KRTR_TEST_NODE_MODULES;
const { chromium } = runtime ? createRequire(path.join(runtime, "package.json"))("playwright") : require("playwright");
const files = ["lib/localDates.ts", "lib/outputs.ts", "components/NrcsPublicationDelivery.tsx", "components/NrcsOutputEditor.tsx", "components/NrcsEditorialPicker.tsx", "components/NrcsHomepageManager.tsx", "components/NrcsCloudinaryAssetPicker.tsx"];
const modules = files.map(file => {
  const id = file.replace(/\.tsx?$/, "");
  const js = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  return `${JSON.stringify(id)}:function(require,module,exports){${js}\n}`;
});
modules.push(`"react/jsx-runtime":function(require,module,exports){${readFileSync(require.resolve("react").replace(/index\.js$/, "cjs/react-jsx-runtime.development.js"), "utf8")}\n}`);
const versions = [{ id: versionId, version_number: 2, headline: "Current headline", body_html: "<h2>Heading</h2><p>Body with <strong>bold</strong> text.</p><blockquote>Quotation</blockquote><ul><li>Bullet</li></ul>", created_at: "2026-09-17T17:00:00Z" }, { id: "f6200000-0000-0000-0000-000000000002", version_number: 1, headline: "Older headline", body_html: "<p>Older copy.</p>", created_at: "2026-09-16T17:00:00Z" }];
const image = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#31a77a"/><circle cx="320" cy="180" r="90" fill="#fff"/></svg>');
const assets = [1, 2].map(i => ({ id: `f6300000-0000-0000-0000-00000000000${i}`, title: `Graphic ${i}`, asset_type: "graphic", cloudinary_url: image, thumbnail_url: null, mux_status: null, mux_playback_id: null }));
assets.push({ id: "f6300000-0000-0000-0000-000000000003", title: "Ready video", asset_type: "video", cloudinary_url: null, thumbnail_url: image, mux_status: "ready", mux_playback_id: "FixturePlayback" });
assets.push({ id: "f6300000-0000-0000-0000-000000000004", title: "Processing video", asset_type: "video", cloudinary_url: null, thumbnail_url: image, mux_status: "preparing", mux_playback_id: null });
const bundle = `var process={env:{NODE_ENV:"development"}};var factories={${modules.join(",")}};var cache={};function load(id){if(id==="react")return window.React;id=id.replace(/^@\\//,"");if(cache[id])return cache[id].exports;var m={exports:{}};cache[id]=m;factories[id](function(n){return load(n.startsWith("./")?id.split("/").slice(0,-1).join("/")+"/"+n.slice(2):n)},m,m.exports);return m.exports;}var page=new URLSearchParams(location.search).get("page");var component=load(page==="homepage"?"components/NrcsHomepageManager":"components/NrcsOutputEditor").default;var props=page==="homepage"?{districtKey:"dlpc",timezone:"America/Chicago",initialLineup:null,initialAlerts:[],initialTarget:null}:{storyId:${JSON.stringify(storyId)},districtKey:"dlpc",timezone:"America/Chicago",editor:new URLSearchParams(location.search).get("contributor")!=="1",initialWeb:null,initialSocial:[],webVersions:${JSON.stringify(versions)},socialVersions:${JSON.stringify(versions)},assets:${JSON.stringify(assets)},initialMedia:[]};ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(component,props));`;
const postcss = require("postcss"), tailwind = require("tailwindcss");
const css = (await postcss([tailwind({ content: files.map(file => path.join(root, file)), theme: { extend: {} }, plugins: [] })]).process(readFileSync(path.join(root, "app/globals.css"), "utf8"), { from: undefined })).css;
const server = createServer((req, res) => {
  if (req.url === "/react.js") return res.end(readFileSync(require.resolve("react").replace(/index\.js$/, "umd/react.development.js")));
  if (req.url === "/react-dom.js") return res.end(readFileSync(require.resolve("react-dom").replace(/index\.js$/, "umd/react-dom.development.js")));
  if (req.url === "/bundle.js") return res.end(bundle);
  res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(`<html><head><meta charset="utf-8"><style>${css}</style></head><body><main style="padding:24px;max-width:1200px;margin:auto"><div id="root"></div></main><script src="/react.js"></script><script src="/react-dom.js"></script><script src="/bundle.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, channel: process.env.KRTR_TEST_BROWSER_CHANNEL || undefined });
try {
  const page = await browser.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => { window.cloudinary = { createMediaLibrary: (config, callbacks) => ({ show() { callbacks.insertHandler({ assets: [{ public_id: "fixture/image", secure_url: "https://res.cloudinary.com/fixture/image/upload/image.png" }] }); }, hide() {} }) }; });
  await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.phase6CopiedText = text; } } }); });
  await page.route("**/api/cloudinary/signature", route => route.fulfill({ json: { cloudName: "fixture", apiKey: "fixture", folder: "krtr" } }));
  await page.route("https://res.cloudinary.com/fixture/image/upload/image.png", route => route.fulfill({ contentType: "image/png", body: readFileSync(path.join(root, "public/graphics/legacy/union-knights.png")) }));
  let posted = [], fail = false;
  let deliveryAttempts = 0;
  let delivery = null;
  await page.route("**/api/publications**", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { delivery } });
    deliveryAttempts++;
    delivery = { status: "received", last_error: null, receipt: { cms_projection_id: uid } };
    return route.fulfill({ json: { delivery } });
  });
  await page.route("**/api/editorial/**", async route => {
    const request = route.request(); const kind = new URL(request.url()).pathname.split("/").at(-1);
    if (request.method() === "GET") {
      const params = new URL(request.url()).searchParams;
      return route.fulfill({ json: { results: [{ id: params.get("selected") || assets[0].id, title: "Selected Editorial Item", subtitle: "published" }], hasMore: false } });
    }
    const data = request.postDataJSON(); posted.push(data);
    if (kind === "image") return route.fulfill({ json: { ok: true, asset: assets[0], message: "Cloudinary image attached." } });
    if (fail) return route.fulfill({ status: 409, json: { error: "Output changed. Reload before saving" } });
    if (kind === "web") { deliveryAttempts++; delivery = { status: "failed", last_error: "CMS unavailable", receipt: null }; }
    const message = kind === "web" ? "Web Output saved and queued for CMS delivery." : kind === "homepage" ? "Homepage instructions saved and queued for CMS delivery." : kind === "alert" ? "Priority Alert saved and queued for CMS delivery." : "Social output saved.";
    return route.fulfill({ json: { ok: true, message, output: { ...data, id: data.id || uid, revision: data.revision + 1 }, lineup: { ...data, revision: data.revision + 1 }, alert: { ...data, revision: data.revision + 1 } } });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.goto(url);
  await page.getByRole("button", { name: "Choose Image/Graphic", exact: true }).click();
  await page.getByRole("button", { name: "Attach Selected", exact: true }).click();
  await page.getByText("Cloudinary image attached.", { exact: true }).waitFor();
  const web = page.locator("section").filter({ has: page.getByRole("heading", { name: "Web Output", exact: true }) });
  assert.equal(await web.locator('[name="copy_version_id"]').inputValue(), versionId);
  await web.getByRole("button", { name: "Choose Hero Image", exact: true }).click();
  await web.getByRole("button", { name: "Use as Hero", exact: true }).click();
  await web.getByRole("button", { name: "Clear Hero Image", exact: true }).waitFor();
  assert.equal(await web.getByAltText("Selected Hero image").count(), 1);
  await web.getByRole("button", { name: "Clear Hero Image", exact: true }).click();
  assert.equal(await web.getByAltText("Selected Hero image").count(), 0);
  await web.getByRole("button", { name: "Use as Hero", exact: true }).click();
  await web.getByRole("button", { name: "Clear Hero Image", exact: true }).waitFor();
  assert.equal(await web.locator('[name="video_asset_id"] option').filter({ hasText: "Processing video" }).evaluate(option => option.disabled), true);
  await web.getByLabel("Primary Video · Optional").selectOption(assets[2].id);
  await web.getByLabel("Tease · Optional").fill("Public tease, not SEO description.");
  await web.getByRole("checkbox").nth(0).check(); await web.getByRole("checkbox").nth(1).check();
  await web.getByRole("button", { name: "Save Web Output", exact: true }).click();
  await web.getByText("Web Output saved and queued for CMS delivery.", { exact: true }).waitFor(); assert.deepEqual(posted.at(-1).media_ids, [assets[0].id, assets[1].id]);
  assert.equal(posted.at(-1).hero_asset_id, assets[0].id);
  assert.equal(posted.at(-1).copy_version_id, versionId);
  assert.equal(posted.at(-1).video_asset_id, assets[2].id);
  assert.equal(posted.at(-1).tease, "Public tease, not SEO description.");
  await web.getByText("CMS delivery failed", { exact: true }).waitFor();
  await web.getByRole("button", { name: "Retry CMS Delivery", exact: true }).click();
  await web.getByText("CMS received (non-public)", { exact: true }).waitFor();
  assert.equal(deliveryAttempts, 2);
  await web.getByRole("button", { name: "Preview Selected Copy" }).click(); await page.getByRole("dialog").waitFor();
  assert.equal(await page.getByRole("dialog").locator("blockquote").innerText(), "Quotation");
  await page.getByRole("button", { name: "Next image" }).click(); await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  fail = true; await web.locator('[name="slug"]').fill("changed"); await web.getByRole("button", { name: "Save Web Output", exact: true }).click(); await web.getByRole("alert").waitFor(); fail = false;
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Save Social Output", exact: true }).click();
  await page.getByText("Social output saved.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Copy Selected Social Text", exact: true }).click();
  await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
  assert.match(await page.evaluate(() => window.phase6CopiedText), /Heading\nBody/);
  mkdirSync(path.join(root, ".phase6-checks"), { recursive: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Output horizontal overflow");
    await page.locator("img").evaluateAll(images => Promise.all(images.map(image => image.decode())));
    assert.equal(await page.locator("img").evaluateAll(images => images.every(image => image.naturalWidth > 0)), true);
    await page.screenshot({ path: path.join(root, `.phase6-checks/outputs-${viewport.width}.png`), fullPage: true });
  }
  await page.goto(`${url}?page=homepage`);
  await page.getByRole("button", { name: "Save Homepage Lineup", exact: true }).click(); await page.getByText("Homepage instructions saved and queued for CMS delivery.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Daily Edition None selected", exact: true }).click();
  await page.getByRole("button", { name: "Selected Editorial Item published", exact: true }).click();
  await page.getByRole("button", { name: "Choose Image/Graphic", exact: true }).click();
  await page.getByRole("button", { name: "Attach Selected", exact: true }).click();
  await page.getByText("Cloudinary image attached.", { exact: true }).waitFor();
  assert.equal(posted.at(-1).edition_id, assets[0].id);
  await page.getByRole("button", { name: "Save Homepage Lineup", exact: true }).click();
  assert.equal(posted.at(-1).daily_asset_id, assets[0].id);
  await page.locator('[name="headline"]').fill("Test Priority Alert"); await page.locator('[name="message"]').fill("A clear alert message."); await page.locator('[name="active"]').check();
  await page.getByRole("button", { name: "Save Priority Alert", exact: true }).click(); await page.getByRole("heading", { name: "Test Priority Alert" }).waitFor();
  await page.getByRole("button", { name: "Hero Story None selected", exact: true }).click();
  await page.getByRole("button", { name: "Selected Editorial Item published", exact: true }).click();
  await page.getByRole("button", { name: "Save Homepage Lineup", exact: true }).click();
  assert.equal(posted.at(-1).hero_output_id, assets[0].id);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Homepage horizontal overflow");
    await page.locator("img").evaluateAll(images => Promise.all(images.map(image => image.decode())));
    assert.equal(await page.locator("img").evaluateAll(images => images.every(image => image.naturalWidth > 0)), true);
    await page.screenshot({ path: path.join(root, `.phase6-checks/homepage-${viewport.width}.png`), fullPage: true });
  }
  await page.goto(`${url}?contributor=1`);
  assert.equal(await page.locator('select[name="status"]').first().locator("option").count(), 1);
  assert.deepEqual(errors, []);
  console.log("Phase 6 asynchronous editors, media preview, errors, contributor UI, and desktop/mobile checks passed.");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
