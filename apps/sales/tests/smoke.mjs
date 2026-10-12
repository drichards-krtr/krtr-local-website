import assert from "node:assert/strict";
const origin = process.env.SALES_SMOKE_ORIGIN || "http://127.0.0.1:3002";
// Run against an unconfigured local server; verifies no database-free bypass.
for (const route of ["/", "/dashboard", "/districts", "/settings/regions", "/settings/access", "/login", "/reset-password", "/update-password", "/auth/callback", "/customers", "/pipeline", "/access-requests", "/invite", "/customers/00000000-0000-4000-8000-000000000001", "/opportunities/00000000-0000-4000-8000-000000000001"]) {
  const response = await fetch(origin + route, { redirect: "manual" });
  assert.equal(response.status, 307, route);
  assert.equal(new URL(response.headers.get("location"), origin).pathname, "/setup", route);
  console.log(route + " -> setup");
}
const response = await fetch(origin + "/setup");
assert.equal(response.status, 200);
const html = await response.text();
assert.ok(html.includes("Sales database setup pending"));
assert.ok(html.includes("No campaigns, payments, or customer records"));
console.log("Setup screen: 200, truthful pending state.");
