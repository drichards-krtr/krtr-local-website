import Link from "next/link";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { createNrcsServerClient } from "@/lib/server";
import { formatLocalDateTime } from "@/lib/workflow";

type SearchResult = {
  type: string;
  title: string;
  snippet: string | null;
  href: string;
  updatedAt: string | null;
};

function excerpt(value: string | null | undefined) {
  const text = String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 220) : null;
}

function includesQuery(value: string | null | undefined, query: string) {
  return String(value || "").toLowerCase().includes(query.toLowerCase());
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; district?: string; type?: string; status?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) || {};
  await requireNrcsStaff("contributor");
  const { activeDistrict, allowedDistricts } = await getNrcsDistrictContext();
  const districtKey =
    resolvedSearchParams.district && allowedDistricts.some((district) => district.district_key === resolvedSearchParams.district)
      ? resolvedSearchParams.district
      : activeDistrict?.district_key || "dlpc";
  const q = String(resolvedSearchParams.q || "").trim();
  const type = String(resolvedSearchParams.type || "all");
  const status = String(resolvedSearchParams.status || "all");
  const supabase = await createNrcsServerClient();
  const results: SearchResult[] = [];

  if (q) {
    if (type === "all" || type === "story") {
      let query = supabase
        .from("nrcs_stories")
        .select("id, title, lifecycle_state, updated_at")
        .eq("district_key", districtKey)
        .ilike("title", `%${q}%`)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (status !== "all") query = query.eq("lifecycle_state", status);
      const { data } = await query;
      for (const row of data || []) {
        results.push({
          type: "Story",
          title: row.title,
          snippet: row.lifecycle_state,
          href: `/stories/${row.id}?district=${districtKey}`,
          updatedAt: row.updated_at,
        });
      }

      const { data: facts } = await supabase
        .from("nrcs_story_facts")
        .select("body_html, updated_at, nrcs_stories(id, title, district_key, lifecycle_state)")
        .ilike("body_html", `%${q}%`)
        .limit(20);
      for (const row of facts || []) {
        const story = Array.isArray(row.nrcs_stories) ? row.nrcs_stories[0] : row.nrcs_stories;
        if (!story || story.district_key !== districtKey) continue;
        if (status !== "all" && story.lifecycle_state !== status) continue;
        results.push({
          type: "Fact",
          title: story.title,
          snippet: excerpt(row.body_html),
          href: `/stories/${story.id}?district=${districtKey}`,
          updatedAt: row.updated_at,
        });
      }

      const { data: versions } = await supabase
        .from("nrcs_copy_versions")
        .select("id, headline, body_html, created_at, nrcs_copy_streams(story_id, stream_type, nrcs_stories(id, title, district_key, lifecycle_state))")
        .or(`headline.ilike.%${q}%,body_html.ilike.%${q}%`)
        .limit(20);
      for (const row of versions || []) {
        const stream = Array.isArray(row.nrcs_copy_streams) ? row.nrcs_copy_streams[0] : row.nrcs_copy_streams;
        const story = Array.isArray(stream?.nrcs_stories) ? stream?.nrcs_stories[0] : stream?.nrcs_stories;
        if (!story || story.district_key !== districtKey) continue;
        if (status !== "all" && story.lifecycle_state !== status) continue;
        results.push({
          type: "Copy Version",
          title: `${story.title}${row.headline ? ` - ${row.headline}` : ""}`,
          snippet: excerpt(row.body_html),
          href: `/stories/${story.id}?district=${districtKey}`,
          updatedAt: row.created_at,
        });
      }
    }

    if (type === "all" || type === "event") {
      const { data } = await supabase
        .from("nrcs_events")
        .select("id, title, body_html, status, start_at, updated_at")
        .eq("district_key", districtKey)
        .or(`title.ilike.%${q}%,body_html.ilike.%${q}%`)
        .order("start_at", { ascending: false })
        .limit(20);
      for (const row of data || []) {
        if (status !== "all" && row.status !== status) continue;
        results.push({
          type: "Event",
          title: row.title,
          snippet: excerpt(row.body_html) || row.status,
          href: `/events/${row.id}?district=${districtKey}`,
          updatedAt: row.updated_at,
        });
      }
    }

    if (type === "all" || type === "asset") {
      const { data } = await supabase
        .from("nrcs_assets")
        .select("id, title, asset_type, district_key, created_at")
        .ilike("title", `%${q}%`)
        .limit(20);
      for (const row of data || []) {
        if (row.district_key && row.district_key !== districtKey) continue;
        results.push({
          type: "Asset",
          title: row.title,
          snippet: row.asset_type,
          href: "/stories",
          updatedAt: row.created_at,
        });
      }
    }

    if (type === "all" || type === "source") {
      const { data } = await supabase
        .from("nrcs_sources")
        .select("id, name, organization, notes, updated_at")
        .or(`name.ilike.%${q}%,organization.ilike.%${q}%,notes.ilike.%${q}%`)
        .limit(20);
      for (const row of data || []) {
        results.push({
          type: "Source",
          title: row.name,
          snippet: excerpt(row.organization || row.notes),
          href: "/stories",
          updatedAt: row.updated_at,
        });
      }
    }

    if (type === "all" || type === "tag") {
      const { data: tags } = await supabase.from("nrcs_tags").select("id, name, tag_type").ilike("name", `%${q}%`).limit(20);
      for (const row of tags || []) {
        results.push({
          type: "Tag",
          title: row.name,
          snippet: row.tag_type,
          href: `/stories?search=${encodeURIComponent(row.name)}&district=${districtKey}`,
          updatedAt: null,
        });
      }
      const { data: aliases } = await supabase.from("nrcs_tag_aliases").select("alias, nrcs_tags(id, name, tag_type)").ilike("alias", `%${q}%`).limit(20);
      for (const row of aliases || []) {
        const tag = Array.isArray(row.nrcs_tags) ? row.nrcs_tags[0] : row.nrcs_tags;
        if (!tag) continue;
        results.push({
          type: "Tag Alias",
          title: row.alias,
          snippet: `Alias of ${tag.name}`,
          href: `/stories?search=${encodeURIComponent(tag.name)}&district=${districtKey}`,
          updatedAt: null,
        });
      }
    }

    if (type === "all" || type === "category") {
      const { data } = await supabase.from("nrcs_categories").select("id, name, district_key, updated_at").eq("district_key", districtKey).ilike("name", `%${q}%`).limit(20);
      for (const row of data || []) {
        results.push({
          type: "Category",
          title: row.name,
          snippet: row.district_key.toUpperCase(),
          href: "/taxonomy",
          updatedAt: row.updated_at,
        });
      }
    }
  }

  const [{ data: recentItems }, { data: recentStories }] = await Promise.all([
    supabase.from("nrcs_recent_items").select("object_type, object_id, title, href, viewed_at").order("viewed_at", { ascending: false }).limit(10),
    supabase.from("nrcs_stories").select("id, title, lifecycle_state, updated_at").eq("district_key", districtKey).order("updated_at", { ascending: false }).limit(10),
  ]);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Global Search</h1>
        <p className="text-sm text-neutral-500">Search newsroom objects with permission-safe results.</p>
      </header>

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <input name="q" defaultValue={q} placeholder="Search" className="min-w-[260px] rounded border border-neutral-300 px-3 py-2 text-sm" />
        <select name="district" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {allowedDistricts.map((district) => (
            <option key={district.district_key} value={district.district_key}>{district.display_name}</option>
          ))}
        </select>
        <select name="type" defaultValue={type} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All types</option>
          <option value="story">Stories/Facts/Copy</option>
          <option value="event">Events</option>
          <option value="asset">Assets</option>
          <option value="source">Sources</option>
          <option value="tag">Tags</option>
          <option value="category">Categories</option>
        </select>
        <select name="status" defaultValue={status} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          <option value="idea">Idea</option>
          <option value="reporting">Reporting</option>
          <option value="ready">Ready</option>
          <option value="active">Active</option>
          <option value="dormant">Dormant</option>
          <option value="closed">Closed</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Search</button>
      </form>

      {q ? (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Results</h2>
          {results.map((result, index) => (
            <Link key={`${result.type}-${result.href}-${index}`} href={result.href} className="rounded border border-neutral-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{result.title}</span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{result.type}</span>
                {result.updatedAt && <span className="text-xs text-neutral-500">{formatLocalDateTime(result.updatedAt)}</span>}
              </div>
              {result.snippet && <p className="mt-2 text-neutral-600">{result.snippet}</p>}
            </Link>
          ))}
          {results.length === 0 && <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">No results found.</p>}
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="grid gap-3">
            <h2 className="text-lg font-semibold">Recently Opened</h2>
            {(recentItems || []).map((item) => (
              <Link key={`${item.object_type}-${item.object_id}`} href={item.href} className="rounded border border-neutral-200 bg-white p-4 text-sm">
                <span className="font-semibold">{item.title}</span>
                <span className="ml-2 capitalize text-neutral-500">{item.object_type.replace("_", " ")}</span>
              </Link>
            ))}
            {(recentItems || []).length === 0 && <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">No recently opened items yet.</p>}
          </section>
          <section className="grid gap-3">
            <h2 className="text-lg font-semibold">Recently Updated</h2>
            {(recentStories || []).map((story) => (
              <Link key={story.id} href={`/stories/${story.id}?district=${districtKey}`} className="rounded border border-neutral-200 bg-white p-4 text-sm">
                <span className="font-semibold">{story.title}</span>
                <span className="ml-2 capitalize text-neutral-500">{story.lifecycle_state}</span>
              </Link>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
