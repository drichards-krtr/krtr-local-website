import { createServerSupabase } from "@/lib/supabase/server";

export default async function AdsPage({
  searchParams,
}: {
  searchParams: { placement?: string; active?: string; search?: string };
}) {
  const supabase = createServerSupabase();
  const placement = searchParams.placement || "all";
  const active = searchParams.active || "all";
  const search = searchParams.search?.trim() || "";

  let query = supabase
    .from("ads")
    .select("id, placement, start_date, end_date, active, image_url, link_url")
    .order("created_at", { ascending: false });

  if (placement !== "all") {
    query = query.eq("placement", placement);
  }
  if (active !== "all") {
    query = query.eq("active", active === "true");
  }
  if (search) {
    query = query.or(`image_url.ilike.%${search}%,link_url.ilike.%${search}%`);
  }

  const { data: ads } = await query;

  async function addAd(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    await supabase.from("ads").insert({
      placement: String(formData.get("placement") || "allsite"),
      start_date: String(formData.get("start_date")),
      end_date: String(formData.get("end_date")),
      active: formData.get("active") === "on",
      image_url: String(formData.get("image_url") || ""),
      link_url: String(formData.get("link_url") || ""),
      html: String(formData.get("html") || ""),
      weight: Number(formData.get("weight") || 1),
    });
  }

  async function toggleAd(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const id = String(formData.get("id"));
    const next = formData.get("next") === "true";
    await supabase.from("ads").update({ active: next }).eq("id", id);
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Ads</h1>
        <p className="text-sm text-neutral-500">
          Manage ad placements and schedules.
        </p>
      </header>

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <input
          name="search"
          placeholder="Search URLs"
          defaultValue={search}
          className="w-56 rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          name="placement"
          defaultValue={placement}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">All placements</option>
          <option value="allsite">All-site</option>
          <option value="homepage">Homepage</option>
          <option value="story">Story</option>
        </select>
        <select
          name="active"
          defaultValue={active}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Apply
        </button>
      </form>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Create Ad</h2>
        <form action={addAd} className="grid gap-3 md:grid-cols-2">
          <select
            name="placement"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="allsite">All-site</option>
            <option value="homepage">Homepage</option>
            <option value="story">Story</option>
          </select>
          <input
            name="weight"
            type="number"
            min="1"
            defaultValue="1"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="start_date"
            type="date"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="end_date"
            type="date"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="image_url"
            placeholder="Image URL"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="link_url"
            placeholder="Link URL"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <textarea
            name="html"
            placeholder="Optional HTML"
            className="min-h-[80px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked />
            Active
          </label>
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white md:col-span-2"
          >
            Save Ad
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Placement</div>
          <div>Dates</div>
          <div>Status</div>
          <div>Preview</div>
          <div>Actions</div>
        </div>
        {(ads || []).map((ad) => (
          <div
            key={ad.id}
            className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
          >
            <div className="capitalize">{ad.placement}</div>
            <div>
              {ad.start_date} - {ad.end_date}
            </div>
            <div>{ad.active ? "Active" : "Inactive"}</div>
            <div className="truncate">
              {ad.image_url || ad.link_url || "—"}
            </div>
            <div className="flex gap-3">
              <a href={`/cms/ads/${ad.id}`} className="text-sm underline">
                Edit
              </a>
              <form action={toggleAd}>
                <input type="hidden" name="id" value={ad.id} />
                <input
                  type="hidden"
                  name="next"
                  value={(!ad.active).toString()}
                />
                <button type="submit" className="text-sm underline">
                  {ad.active ? "Unpublish" : "Publish"}
                </button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
