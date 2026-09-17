import { NextResponse } from "next/server";
import { getCurrentNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { getDelivery, sendPublication } from "@/lib/publicationDelivery";
import type { PublicationKind } from "@/lib/editorialContract";

export const runtime = "nodejs";
async function handle(request: Request, send: boolean) {
  const staff = await getCurrentNrcsStaff();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (staff.profile.role === "contributor") return NextResponse.json({ error: "Editor access required." }, { status: 403 });
  try {
    const body = send ? await request.json() : Object.fromEntries(new URL(request.url).searchParams);
    const { kind, source_id: sourceId, district_key: districtKey } = body;
    const revision = Number(body.revision);
    if (!["web", "homepage", "alert"].includes(kind) || typeof districtKey !== "string" || !Number.isSafeInteger(revision) || revision < 1 || typeof sourceId !== "string" || (kind === "homepage" ? sourceId !== districtKey : !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId))) throw new Error("Invalid delivery request.");
    const context = await getNrcsDistrictContext();
    if (!context.allowedDistricts.some(d => d.district_key === districtKey)) return NextResponse.json({ error: "District is not accessible." }, { status: 403 });
    const delivery = send ? await sendPublication(kind as PublicationKind, sourceId, districtKey, revision) : await getDelivery(kind as PublicationKind, sourceId, revision, districtKey);
    return NextResponse.json({ delivery }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delivery failed." }, { status: 400 });
  }
}
export function GET(request: Request) { return handle(request, false); }
export function POST(request: Request) { return handle(request, true); }
