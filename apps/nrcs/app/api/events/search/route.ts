import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";

const PAGE_SIZE = 25;

function formatEventSubtitle(startAt: string | null, status: string | null) {
  const date = startAt ? new Date(startAt) : null;
  const formattedDate =
    date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date)
      : "No start time";

  return `${formattedDate} - ${status || "unknown"}`;
}

export async function GET(request: Request) {
  await requireNrcsStaff("contributor");

  const url = new URL(request.url);
  const districtKey = String(url.searchParams.get("district") || "").trim().toLowerCase();
  const queryText = String(url.searchParams.get("q") || "").trim();
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0) || 0);

  const supabase = await createNrcsServerClient();
  let query = supabase
    .from("nrcs_events")
    .select("id, title, start_at, status, location_name, city")
    .order("start_at", { ascending: queryText.length > 0 ? false : true })
    .range(offset, offset + PAGE_SIZE);

  if (districtKey) query = query.eq("district_key", districtKey);
  if (queryText.length >= 2) {
    query = query.ilike("title", `%${queryText}%`);
  } else {
    query = query.gte("start_at", new Date().toISOString());
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const results = rows.slice(0, PAGE_SIZE).map((event) => ({
    id: event.id,
    title: event.title,
    subtitle: formatEventSubtitle(event.start_at, event.status),
    meta: [event.location_name, event.city].filter(Boolean).join(" - ") || "No location",
  }));

  return NextResponse.json({ ok: true, results, hasMore: rows.length > PAGE_SIZE });
}
