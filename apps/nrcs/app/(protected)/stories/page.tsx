import Link from "next/link";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { createNrcsServerClient } from "@/lib/server";
import { STORY_LIFECYCLE_STATES } from "@/lib/stories";

type StoryRow = {
  id: string;
  district_key: string;
  title: string;
  lifecycle_state: string;
  updated_at: string;
  created_at: string;
  created_by: string | null;
};

export default async function NrcsStoriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ district?: string; lifecycle?: string; search?: string; error?: string; success?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) || {};
  await requireNrcsStaff("contributor");
  const { activeDistrict, allowedDistricts } = await getNrcsDistrictContext();
  const districtKey =
    resolvedSearchParams.district && allowedDistricts.some((district) => district.district_key === resolvedSearchParams.district)
      ? resolvedSearchParams.district
      : activeDistrict?.district_key || "dlpc";
  const lifecycle = STORY_LIFECYCLE_STATES.includes(resolvedSearchParams.lifecycle as never)
    ? resolvedSearchParams.lifecycle || "all"
    : "all";
  const search = resolvedSearchParams.search?.trim() || "";

  const supabase = await createNrcsServerClient();
  let query = supabase
    .from("nrcs_stories")
    .select("id, district_key, title, lifecycle_state, updated_at, created_at, created_by")
    .eq("district_key", districtKey)
    .order("updated_at", { ascending: false });

  if (lifecycle !== "all") query = query.eq("lifecycle_state", lifecycle);
  if (search) query = query.ilike("title", `%${search}%`);

  const { data, error } = await query.limit(100);
  if (error) {
    throw new Error(`Unable to load stories: ${error.message}`);
  }

  const stories = (data || []) as unknown as StoryRow[];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stories</h1>
          <p className="text-sm text-neutral-500">Canonical newsroom stories, lifecycle state, and copy streams.</p>
        </div>
        <Link href={`/stories/new?district=${districtKey}`} className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
          New Story
        </Link>
      </header>

      {resolvedSearchParams.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{resolvedSearchParams.error}</p>}
      {resolvedSearchParams.success && <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">Story update saved.</p>}

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <select name="district" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {allowedDistricts.map((district) => (
            <option key={district.district_key} value={district.district_key}>
              {district.display_name}
            </option>
          ))}
        </select>
        <select name="lifecycle" defaultValue={lifecycle} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All lifecycle states</option>
          {STORY_LIFECYCLE_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
        <input name="search" defaultValue={search} placeholder="Search stories" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Apply</button>
      </form>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Title</div>
          <div>Lifecycle</div>
          <div>Owner</div>
          <div>Updated</div>
        </div>
        {stories.map((story) => (
          <div key={story.id} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 border-b border-neutral-100 px-4 py-3 text-sm">
            <Link href={`/stories/${story.id}?district=${districtKey}`} className="font-medium underline">
              {story.title}
            </Link>
            <div className="capitalize">{story.lifecycle_state}</div>
            <div className="truncate text-neutral-600">{story.created_by ? story.created_by.slice(0, 8) : "-"}</div>
            <div className="text-neutral-600">{new Date(story.updated_at || story.created_at).toLocaleDateString()}</div>
          </div>
        ))}
        {stories.length === 0 && <p className="px-4 py-6 text-sm text-neutral-500">No stories match this view.</p>}
      </section>
    </div>
  );
}
