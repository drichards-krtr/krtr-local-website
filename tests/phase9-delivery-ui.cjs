const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
(async () => {
  const runtime = process.env.KRTR_TEST_NODE_MODULES;
  const { chromium } = require(runtime ? path.join(runtime, "playwright") : "playwright");
  const postcss = require("postcss"), tailwind = require("tailwindcss");
  const css = (await postcss([tailwind({ content: ["apps/nrcs/components/NrcsPublicationDelivery.tsx"] })]).process("@tailwind base; @tailwind utilities;", { from: undefined })).css;
  const code = ts.transpileModule(fs.readFileSync("apps/nrcs/components/NrcsPublicationDelivery.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const browser = await chromium.launch({ channel: process.env.KRTR_TEST_BROWSER_CHANNEL || "msedge", headless: true });
  const receipt = { state: "scheduled", cms_projection_id: "projection", cms_article_id: "article" };
  let failed = false, requests = [];
  try {
    for (const width of [390, 1366]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.route("https://fixture.invalid/**", async route => {
        if (!route.request().url().includes("/api/publications")) return route.fulfill({ contentType: "text/html", body: `<html><head><style>${css}</style></head><body><main id="root" style="padding:24px;max-width:700px"></main></body></html>` });
        if (route.request().method() === "GET") return route.fulfill({ json: { delivery: { status: "received", receipt } } });
        requests.push(route.request().postDataJSON());
        await new Promise(resolve => setTimeout(resolve, 100));
        return route.fulfill(failed ? { status: 500, json: { error: "CMS unavailable" } } : { json: { delivery: { status: "received", receipt, confirmation: { receipt: { ...receipt, state: "published" }, current: true, checked_at: "2026-09-17T12:00:00Z" } } } });
      });
      await page.goto("https://fixture.invalid");
      await page.addScriptTag({ path: require.resolve("react").replace(/index\.js$/, "umd/react.development.js") });
      await page.addScriptTag({ path: require.resolve("react-dom").replace(/index\.js$/, "umd/react-dom.development.js") });
      await page.addScriptTag({ content: `const module={exports:{}}; const exports=module.exports; const require=()=>React; ${code}\nReactDOM.createRoot(document.getElementById('root')).render(React.createElement(module.exports.default,{kind:'web',sourceId:'source',districtKey:'dlpc',revision:1}));` });
      await page.getByText("CMS confirmed: scheduled", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Check CMS Status" }).click();
      await page.getByText("CMS confirmed: published", { exact: true }).waitFor();
      assert.equal(requests.at(-1).action, "refresh");
      failed = true;
      await page.getByRole("button", { name: "Check CMS Status" }).click();
      await page.getByRole("alert").filter({ hasText: "CMS unavailable" }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Check CMS Status" }).isEnabled(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      fs.mkdirSync(".tmp/phase9/screenshots", { recursive: true });
      await page.screenshot({ path: `.tmp/phase9/screenshots/delivery-${width}.png`, fullPage: true });
      await page.close(); failed = false;
    }
    console.log("Phase 9 delivery UI desktop/mobile status refresh, visible failures and retry passed.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
