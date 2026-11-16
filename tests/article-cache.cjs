// Production-server integration test with an isolated PostgREST fixture.
// Build first with the fixture environment described in docs/article-caching.md.
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { once } = require("node:events");
const id = n => `f9100000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const secret = "fixture-nrcs-secret";
const base = "http://127.0.0.1:3100";
let reads = 0, impressions = 0;
const stories = ["dlpc", "vs", "bc"].map((district_key, i) => ({
  id: id(i + 1), district_key, slug: "cache-test", title: `Original ${district_key}`,
  status: "published", published_at: "2026-01-01T12:00:00Z", tease: "Fixture tease",
  body_html: "<p>Fixture article body</p>", body_markdown: "", editorial_origin: "nrcs",
  image_url: "https://example.invalid/hero.jpg", mux_playback_id: "fixture-playback",
  video_orientation: "horizontal", article_media: [], seo_title: null, seo_description: null,
}));
let aliases = [];
const json = (response, body, status = 200) => {
  response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(body));
};
const fixture = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://fixture");
  let raw = ""; for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : null;
  if (url.pathname === "/auth/v1/user") return json(response, { error: "No user" }, 401);
  if (url.pathname.endsWith("/rpc/receive_nrcs_web_publication")) {
    const e = body.p_package, p = e.payload, row = stories.find(s => s.district_key === e.district_key);
    if (row.slug !== p.slug) aliases.push({ district_key: row.district_key, slug: row.slug, story_id: row.id });
    Object.assign(row, { title: p.title, slug: p.slug, body_html: p.body_html,
      status: ["published", "scheduled"].includes(p.status) ? "published" : "archived",
      published_at: p.scheduled_at || p.published_at });
    return json(response, { schema_version: 1, request_id: e.request_id, kind: e.kind,
      source_id: e.source_id, district_key: e.district_key, revision: e.revision,
      current_projection_revision: e.revision, content_hash: body.p_hash,
      cms_projection_id: id(90), cms_article_id: row.id, received_at: new Date().toISOString(),
      state: p.status, public_url: p.status === "unpublished" ? null : `/stories/${row.slug}`,
      published_at: p.status === "published" ? row.published_at : null });
  }
  if (url.pathname.endsWith("/rpc/increment_ad_daily_impressions")) { impressions += body.p_ad_ids.length; return json(response, null); }
  const table = url.pathname.split("/").pop();
  let rows = [];
  if (table === "stories") { reads++; rows = stories.filter(s => !url.searchParams.has("status") || s.status === "published" && (!s.published_at || Date.parse(s.published_at) <= Date.now())); }
  if (table === "story_slug_aliases") rows = aliases;
  if (table === "districts") rows = [ { district_key: "dlpc", subdomain: "dlpc.krtrlocal.tv" } ];
  if (table === "ads") rows = [ { id: id(80), district_key: "dlpc", placement: "story", image_url: "https://example.invalid/ad.jpg", html: null, link_url: null, weight: 1 },
    { id: id(81), district_key: "dlpc", placement: "allsite", image_url: "https://example.invalid/ad.jpg", html: null, link_url: null, weight: 1 } ];
  if (table === "alerts") rows = [{ id: id(82), district_key: "dlpc", message: "Fixture alert", link_url: "/weather", start_at: null, end_at: null }];
  if (table === "site_pages") rows = [{ district_key: "dlpc", slug: "about", title: "Fixture About", body_markdown: "Fixture informational copy" }];
  for (const [key, value] of url.searchParams) {
    if (value.startsWith("eq.") && rows.some(row => key in row)) rows = rows.filter(row => String(row[key]) === value.slice(3));
    if (value.startsWith("like.")) rows = rows.filter(row => String(row[key]).startsWith(value.slice(5).replace(/%$/, "")));
  }
  if (url.searchParams.has("limit")) rows = rows.slice(0, Number(url.searchParams.get("limit")));
  json(response, rows);
});

async function request(url, options = {}) {
  const response = await fetch(base + url, { redirect: "manual", ...options });
  return { status: response.status, headers: response.headers, text: await response.text() };
}
const article = (host = "dlpc.krtrlocal.tv", slug = "cache-test", extra = {}) => request(`/stories/${slug}`, { headers: { host, ...extra } });
const clear = district => request("/api/cms/article-cache", { method: "POST", headers: { authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ district }) });
async function publish(changes, revision) {
  const envelope = { schema_version: 1, request_id: id(100 + revision), source_id: id(50), district_key: "dlpc", revision, kind: "web",
    payload: { story_id: id(51), copy_version_id: id(52), title: "Published correction", body_html: "<p>Corrected copy</p>", tease: null,
      slug: "cache-test", status: "published", scheduled_at: null, published_at: "2026-01-01T12:00:00Z", seo_title: null, seo_description: null,
      hero: null, video: null, category: null, tags: [], article_media: [], ...changes } };
  const result = await request("/api/nrcs/publications", { method: "POST", headers: { authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify(envelope) });
  assert.equal(result.status, 200, result.text);
}

(async () => {
  fixture.listen(54399, "127.0.0.1"); await once(fixture, "listening");
  const preload = path.resolve(".tmp/article-cache/network.cjs");
  fs.mkdirSync(path.dirname(preload), { recursive: true });
  fs.writeFileSync(preload, `const original = global.fetch; global.fetch = (input, init) => String(input?.url || input).startsWith('https://api.weather.gov/') ? Promise.resolve(new Response('{}', {status:503})) : original(input, init);`);
  const server = spawn(process.execPath, ["--require", preload, "node_modules/next/dist/bin/next", "start", "-p", "3100"], {
    windowsHide: true, env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54399", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key", CMS_NRCS_API_SECRET: secret, CMS_NRCS_PUBLICATION_ENABLED: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = ""; server.stdout.on("data", chunk => { logs += chunk; }); server.stderr.on("data", chunk => { logs += chunk; });
  try {
    for (let i = 0; i < 80; i++) {
      try { await request("/robots.txt"); break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    for (const district of ["dlpc", "vs", "bc"]) assert.equal((await clear(district)).status, 200);
    const first = await article(); assert.equal(first.status, 200, first.text.slice(0, 200));
    assert.match(first.text, /<h1[^>]*>Original dlpc<\/h1>/);
    assert.match(first.text, /Fixture article body/); assert.match(first.text, /fixture-playback/);
    assert.match(first.text, /https:\/\/dlpc.krtrlocal.tv\/stories\/cache-test/);
    const before = reads;
    const hit = await article(); assert.equal(hit.headers.get("x-nextjs-cache"), "HIT"); assert.equal(reads, before, "Cache hit must avoid story DB queries");
    assert.equal(impressions, 0, "SSR and cache hits must never record ad impressions");
    const other = await article("vs.krtrlocal.tv"); assert.match(other.text, /Original vs/); assert.doesNotMatch(other.text, /<h1[^>]*>Original dlpc/);
    const root = await article("krtrlocal.tv"); assert.match(root.text, /https:\/\/krtrlocal.tv\/stories\/cache-test/);
    const spoof = await article("vs.krtrlocal.tv", "cache-test", { "x-krtr-district": "dlpc", "x-forwarded-host": "dlpc.krtrlocal.tv" });
    assert.match(spoof.text, /Original vs/);
    assert.equal((await request("/article-cache/dlpc/cache-test")).status, 404);
    assert.equal((await request("/api/cms/article-cache", { method: "POST", body: "{}" })).status, 401);
    console.log("PASS: cached HTML/RSC route, server-rendered content/metadata/video, host isolation, spoof resistance, no SSR impressions, cache endpoint auth");
    const home = await request("/", {headers:{host:"dlpc.krtrlocal.tv"}});
    assert.equal(home.status,200);assert.match(home.text,/Original dlpc/);
    const homeReads=reads;
    const homeHit=await request("/",{headers:{host:"dlpc.krtrlocal.tv"}});
    assert.equal(homeHit.headers.get("x-nextjs-cache"),"HIT");assert.equal(reads,homeReads);
    const about=await request("/about",{headers:{host:"dlpc.krtrlocal.tv"}});
    assert.equal(about.status,200);assert.match(about.text,/Fixture informational copy/);
    const calendar=await request("/calendar?view=calendar",{headers:{host:"dlpc.krtrlocal.tv"}});
    assert.equal(calendar.status,200);assert.match(calendar.text,/Previous/);
    const list=await request("/calendar?view=list",{headers:{host:"dlpc.krtrlocal.tv"}});
    assert.equal(list.status,200);assert.doesNotMatch(list.text,/>Previous</);
    assert.equal(impressions,0,"Homepage output and prefetched HTML must not record ads");
    console.log("PASS: homepage output hit without database reads, informational output, calendar query isolation, no cached homepage ad impressions");
    await publish({}, 1);
    const corrected = await article(); assert.match(corrected.text, /<h1[^>]*>Published correction<\/h1>/); assert.match(corrected.text, /Corrected copy/);
    const vsBefore = reads; await article("vs.krtrlocal.tv"); assert.equal(reads, vsBefore, "Publishing DLPC must preserve VS cache");
    const rootCorrected = await article("krtrlocal.tv"); assert.match(rootCorrected.text, /Published correction/);
    const refreshedHome=await request("/",{headers:{host:"dlpc.krtrlocal.tv"}});
    assert.match(refreshedHome.text,/Published correction/);assert.doesNotMatch(refreshedHome.text,/Original dlpc/);
    await publish({ slug: "renamed-test" }, 2);
    const old = await article(); assert.equal(old.status, 307); assert.equal(old.headers.get("location"), "/stories/renamed-test");
    const byId = await article("dlpc.krtrlocal.tv", stories[0].id); assert.equal(byId.status, 307);
    assert.equal((await article("dlpc.krtrlocal.tv", "renamed-test")).status, 200);
    await publish({ slug: "renamed-test", status: "unpublished" }, 3);
    assert.equal((await article("dlpc.krtrlocal.tv", "renamed-test")).status, 404);
    assert.equal((await article()).status, 404, "Historical aliases must also stop serving withdrawn content");
    console.log("PASS: actual NRCS POST → DB fixture → receipt → cache invalidation; correction, root/district variants, rename, ID redirect, withdrawal");
    await publish({ slug: "scheduled-test", status: "scheduled", scheduled_at: new Date(Date.now() + 1500).toISOString(), published_at: null }, 4);
    const scheduled = await article("dlpc.krtrlocal.tv", "scheduled-test"); assert.equal(scheduled.status, 404);
    assert.match(scheduled.headers.get("cache-control"), /s-maxage=60/);
    const chrome = await request("/api/public/article-chrome/dlpc"); assert.equal(chrome.status, 200, chrome.text);
    assert.match(chrome.text, /Fixture alert/);
    const ad = await request("/api/public/article-ads/dlpc", { method: "POST" }); assert.equal(ad.status, 200, ad.text); assert.equal(impressions, 2);
    assert.match(ad.headers.get("cache-control"), /no-store/);
    console.log("PASS: scheduled story hidden, negative output has 60-second lifetime, live chrome and uncached ad tracking");
    console.log("Waiting 63 seconds to verify scheduled visibility through real ISR regeneration...");
    await new Promise(resolve => setTimeout(resolve, 63_000));
    let visible;
    for (let i = 0; i < 20; i++) {
      visible = await article("dlpc.krtrlocal.tv", "scheduled-test");
      if (visible.status === 200) break;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    assert.equal(visible.status, 200, "Scheduled story must become visible without publishing again");
    assert.match(visible.text, /Published correction/);
    console.log("PASS: scheduled boundary automatically refreshes cached 404 into published article");
  } catch (error) { console.error(logs.slice(-7000)); throw error; }
  finally { server.kill(); fixture.closeAllConnections(); fixture.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
