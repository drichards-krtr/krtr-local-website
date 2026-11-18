import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isSiteScopeKey } from "@/lib/districts";
import { authorizeNrcsService } from "@/lib/nrcsPublication";
import { invalidatePublicScope } from "@/lib/publicCache";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function authorizeSales(request: Request) {
  const secret = process.env.CMS_SALES_CHAMBER_API_SECRET;
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!secret || !supplied) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(secret), digest(supplied));
}

function authorizeAdmin(request: Request) {
  return authorizeSales(request) ||
    (process.env.NRCS_CHAMBER_ADMIN_ENABLED !== "false" && authorizeNrcsService(request));
}

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const catalog = new URL(request.url).searchParams.get("view") === "catalog";
  if (!(catalog ? authorizeNrcsService(request) : authorizeAdmin(request))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const service = createServiceClient();
  const [accounts, coverage, districts] = await Promise.all([
    service.from("chamber_accounts")
      .select(catalog ? "id, name, city, active" : "id, name, city, active, contact_name, contact_email, contact_phone, notes")
      .order("name").order("id"),
    service.from("chamber_district_coverage").select("chamber_id, district_key, active"),
    catalog ? null : service.from("districts").select("district_key, display_name").order("display_name"),
  ]);
  if (accounts.error || coverage.error || districts?.error) {
    console.error("[chambers] load failed", accounts.error, coverage.error, districts?.error);
    return json({ error: "Unable to load Chamber accounts." }, 500);
  }
  return json({ accounts: accounts.data, coverage: coverage.data, districts: districts?.data });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(request: Request) {
  if (!authorizeAdmin(request)) return json({ error: "Unauthorized" }, 401);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 32000) return json({ error: "Chamber request is too large." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  if (!isObject(body) || !isObject(body.account) || !isObject(body.coverage)) {
    return json({ error: "An account and district coverage are required." }, 400);
  }

  const { id, name, city, active } = body.account;
  if (
    typeof id !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) ||
    typeof name !== "string" || !name.trim() || name.trim().length > 200 ||
    typeof city !== "string" || !city.trim() || city.trim().length > 200 ||
    typeof active !== "boolean" ||
    Object.entries(body.coverage).some(([key, enabled]) => !/^[a-z0-9][a-z0-9-]*$/.test(key) || typeof enabled !== "boolean")
  ) return json({ error: "Invalid Chamber account or district coverage." }, 400);

  const account: Record<string, string | boolean | null> = { id, name: name.trim(), city: city.trim(), active };
  for (const field of ["contact_name", "contact_email", "contact_phone", "notes"] as const) {
    const value = body.account[field];
    if (value != null && (typeof value !== "string" || value.length > (field === "notes" ? 4000 : 320))) {
      return json({ error: "Invalid Chamber contact information or notes." }, 400);
    }
    account[field] = typeof value === "string" ? value.trim() || null : null;
  }

  const { data, error } = await createServiceClient().rpc("save_chamber_account", {
    p_account: account,
    p_coverage: body.coverage,
  });
  if (error) {
    console.error("[chambers] save failed", error);
    return error.code === "23503"
      ? json({ error: "One or more district keys are unknown." }, 400)
      : json({ error: "Unable to save the Chamber account." }, 500);
  }
  for (const district of data.affected_districts as string[]) {
    if (isSiteScopeKey(district)) invalidatePublicScope(district);
  }
  return json(data);
}
