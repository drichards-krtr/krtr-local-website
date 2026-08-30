import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";

const PAGE_SIZE = 25;

function formatUpdatedAt(updatedAt: string | null) {
  const date = updatedAt ? new Date(updatedAt) : null;
  if (!date || Number.isNaN(date.getTime())) return "No update date";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export async function GET(request: Request) {
  await requireNrcsStaff("contributor");

  const url = new URL(request.url);
  const districtKey = String(url.searchParams.get("district") || "").trim().toLowerCase();
  const queryText = String(url.searchParams.get("q") || "").trim();
  const excludeId = String(url.searchParams.get("exclude") || "").trim();
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0) || 0);

  const supabase = await createNrcsServerClient();
  let query = supabase
    .from("nrcs_stories")
    .select("id, title, lifecycle_state, district_key, updated_at")
    .order("updated_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE);

  if (districtKey) query = query.eq("district_key", districtKey);
  if (queryText.length >= 2) query = query.ilike("title", `%${queryText}%`);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const results = rows.slice(0, PAGE_SIZE).map((story) => ({
    id: story.id,
    title: story.title,
    subtitle: `${story.lifecycle_state || "unknown"} - ${story.district_key}`,
    meta: `Updated ${formatUpdatedAt(story.updated_at)}`,
  }));

  return NextResponse.json({ ok: true, results, hasMore: rows.length > PAGE_SIZE });
}
