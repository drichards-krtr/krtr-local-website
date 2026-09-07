import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";

const PAGE_SIZE = 25;

type StreamRow = {
  id: string;
  story_id: string;
  current_version_id: string;
  nrcs_stories: { title: string; district_key: string; lifecycle_state: string } | Array<{ title: string; district_key: string; lifecycle_state: string }> | null;
};

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value || null;
}

export async function GET(request: Request) {
  await requireNrcsStaff("editor");

  const url = new URL(request.url);
  const districtKey = String(url.searchParams.get("district") || "").trim().toLowerCase();
  const queryText = String(url.searchParams.get("q") || "").trim();
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0) || 0);
  const supabase = await createNrcsServerClient();

  let streamQuery = supabase
    .from("nrcs_copy_streams")
    .select("id, story_id, current_version_id, nrcs_stories!inner(title, district_key, lifecycle_state)")
    .eq("stream_type", "rundown")
    .not("current_version_id", "is", null)
    .order("updated_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE);

  if (districtKey) streamQuery = streamQuery.eq("nrcs_stories.district_key", districtKey);
  if (queryText.length >= 2) streamQuery = streamQuery.ilike("nrcs_stories.title", `%${queryText}%`);

  const { data: streams, error } = await streamQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const streamRows = (streams || []) as unknown as StreamRow[];
  const versionIds = streamRows.map((stream) => stream.current_version_id).filter(Boolean);
  const { data: versions, error: versionError } = versionIds.length
    ? await supabase.from("nrcs_copy_versions").select("id, version_number, headline").in("id", versionIds)
    : { data: [] as Array<{ id: string; version_number: number; headline: string | null }>, error: null };
  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 });

  const versionsById = new Map((versions || []).map((version) => [version.id, version]));
  const results = streamRows.slice(0, PAGE_SIZE).flatMap((stream) => {
    const story = one(stream.nrcs_stories);
    const version = versionsById.get(stream.current_version_id);
    if (!story || !version) return [];

    return [
      {
        copyVersionId: version.id,
        title: story.title,
        defaultItemTitle: version.headline || story.title,
        subtitle: `Rundown Copy v${version.version_number} - ${story.lifecycle_state}`,
        meta: version.headline || "No rundown headline",
      },
    ];
  });

  return NextResponse.json({ ok: true, results, hasMore: streamRows.length > PAGE_SIZE });
}
