const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function load(file, mocks) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${js}})`)(name => name in mocks ? mocks[name]?.default ? { __esModule: true, ...mocks[name] } : mocks[name] : require(name), module, module.exports);
  return module.exports;
}
const rehearsal = load("lib/nrcsRehearsal.ts", {});
let managed = true, selectedDaily = "daily", dailyDate = rehearsal.districtCalendarDay("America/Chicago", new Date());
let dailyReads = 0;
const dailyLib = load("lib/dailys.ts", {
  react: { cache: fn => fn },
  "@/lib/dates": { KRTR_TIMEZONE: "America/Chicago" },
  "@/lib/nrcsRehearsal": rehearsal,
  "next/cache": { unstable_noStore() {} },
  "@/lib/supabase/public": { createPublicClient: () => ({ from(table) {
    const q = { select() { return this; }, eq() { return this; }, or() { return this; }, order() { return this; }, limit() { return this; },
      async maybeSingle() { if (table === "story_slots") return { data: { nrcs_managed: managed, nrcs_daily_id: selectedDaily }, error: null }; dailyReads++; return { data: { id: "daily", title: "Daily", nrcs_publication_date: dailyDate, nrcs_timezone: "America/Chicago" }, error: null }; }
    }; return q;
  } }) },
});
const publicEditorial = load("lib/publicEditorial.ts", { "next/cache": {}, "@/lib/supabase/public": {} });
assert.equal(publicEditorial.priorityAlertIsActive({ start_at: "2026-09-18T12:00:00", end_at: "2026-09-18T13:00:00" }, new Date("2026-09-18T12:00:00Z")), true);
assert.equal(publicEditorial.priorityAlertIsActive({ start_at: null, end_at: "2026-09-18T13:00:00" }, new Date("2026-09-18T13:00:00Z")), false);

let alert = null, hasHero = true;
const hero = { id: "hero", slug: "saved-hero", title: "Saved Hero Story", tease: "Saved story remains assigned.", image_url: null, published_at: null, status: "published", district_key: "dlpc" };
function publicDb() { return { from(table) {
  let rows = table === "story_slots" ? hasHero ? [{ slot: "hero", story_id: "hero", district_key: "dlpc" }] : [] : table === "stories" ? [hero] : [];
  return { select() { return this; }, eq(key, value) { rows = rows.filter(row => row[key] === value); return this; }, is() { return this; }, or() { return this; }, in(key, values) { rows = rows.filter(row => values.includes(row[key])); return this; }, order() { return this; }, limit() { return this; }, lte() { return this; }, gte() { return this; }, then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); } };
} }; }
const home = load("components/public/HomePageContent.tsx", {
  "next/link": { default: props => React.createElement("a", props) },
  "@/components/public/AdSlot": { default: () => null },
  "@/components/public/StoryRow": { default: ({ story }) => React.createElement("p", null, story.title) },
  "@/lib/supabase/public": { createPublicClient: publicDb }, "@/lib/supabase/admin": {}, "@/lib/ads": {},
  "@/lib/dailys": { dailyHref: () => "/daily", getLatestPublishedDaily: async () => null },
  "@/lib/dates": { formatDateInTimeZone: () => "Date", getDateTextInTimeZone: () => "2026-09-18" },
  "@/lib/nominations": {}, "@/lib/nominationsServer": {}, "@/lib/nominationVoting": {}, "@/lib/nominationVotingServer": {},
  "@/lib/stories": { storyHref: story => `/stories/${story.slug || story.id}` },
  "@/lib/publicEditorial": { getPublicPriorityAlert: async () => alert },
});
const weather = load("components/public/AlertBanner.tsx", {
  "@/lib/supabase/public": { createPublicClient: publicDb }, "next/cache": { unstable_noStore() {} }, "@/lib/dates": {},
  "@/lib/districtServer": { getCurrentDistrict: async () => ({ key: "dlpc" }) },
  "@/lib/weather": { getCurrentWeather: async () => ({ alerts: ["Severe Weather Test"] }) },
});
(async () => {
  assert.equal((await dailyLib.getLatestPublishedDaily("dlpc")).id, "daily");
  dailyDate = "2000-01-01";
  assert.equal(await dailyLib.getLatestPublishedDaily("dlpc"), null, "Expired selected Daily must not fall back to older content");
  selectedDaily = null; dailyReads = 0;
  assert.equal(await dailyLib.getLatestPublishedDaily("dlpc"), null);
  assert.equal(dailyReads, 0, "Cleared managed Daily must not query legacy latest Daily");
  const postcss = require("postcss"), tailwind = require("tailwindcss");
  const css = (await postcss([tailwind({ content: ["components/public/HomePageContent.tsx", "components/public/AlertBanner.tsx"], theme: { extend: { maxWidth: { site: "1200px" }, colors: { krtrRed: "#d82028" } } } })]).process("@tailwind base; @tailwind components; @tailwind utilities;", { from: undefined })).css;
  const runtime = process.env.KRTR_TEST_NODE_MODULES;
  const { chromium } = require(runtime ? path.join(runtime, "playwright") : "playwright");
  const browser = await chromium.launch({ headless: true, ...(process.env.KRTR_TEST_BROWSER_CHANNEL ? { channel: process.env.KRTR_TEST_BROWSER_CHANNEL } : {}) });
  const output = path.join(".tmp", "phase9", "screenshots"); fs.mkdirSync(output, { recursive: true });
  try {
    for (const width of [390, 1366]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      for (const scenario of ["normal", "alert-with-hero", "alert-without-hero"]) {
        hasHero = scenario !== "alert-without-hero";
        alert = scenario === "normal" ? null : { headline: "Priority Alert - Important District Information", message: "Test details. ".repeat(45), link_url: "/stories/saved-hero" };
        const body = renderToStaticMarkup(React.createElement(React.Fragment, null, await weather.default(), await home.default({ siteScopeKey: "dlpc", showDistrictBanners: false, trackAds: false })));
        await page.setContent(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${body}</body></html>`);
        assert.equal(await page.locator("[role=alert]").count(), scenario === "normal" ? 0 : 1);
        assert.equal(await page.locator("h1").innerText(), scenario === "normal" ? "Saved Hero Story" : alert.headline);
        assert.equal(await page.getByText("Weather Alert: Severe Weather Test").count(), 1, "Severe weather must coexist with Priority Alert");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "No horizontal overflow");
        await page.screenshot({ path: path.join(output, `${scenario}-${width}.png`), fullPage: true });
      }
      await page.close();
    }
  } finally { await browser.close(); }
  console.log("Phase 9 managed Daily selection and desktop/mobile Hero/Priority Alert/weather renderer checks passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
