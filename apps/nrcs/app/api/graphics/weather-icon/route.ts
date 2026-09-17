import { NextResponse } from "next/server";
import { getCurrentNrcsStaff } from "@/lib/auth";
const ICONS = new Set(["skc","nskc","few","nfew","sct","nsct","bkn","nbkn","ovc","novc","ra","nra","shra","nshra","tsra","ntsra","sn","nsn","wind","nwind","hot","cold"]);
export async function GET(request: Request) {
  if (!await getCurrentNrcsStaff()) return new NextResponse(null, { status: 401 });
  const name = new URL(request.url).searchParams.get("name") || "";
  if (!ICONS.has(name)) return new NextResponse(null, { status: 400 });
  try {
    const response = await fetch(`https://www.weather.gov/images/nws/newicons/${name}.png`, { signal: AbortSignal.timeout(8000), redirect: "error", next: { revalidate: 86400 } });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return new NextResponse(null, { status: 502 });
    return new NextResponse(await response.arrayBuffer(), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
  } catch { return new NextResponse(null, { status: 502 }); }
}
