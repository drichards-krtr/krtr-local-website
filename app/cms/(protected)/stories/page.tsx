import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function StoriesPage({
  searchParams,
}: {
  searchParams: { search?: string; status?: string };
}) {
  const supabase = createServerSupabase();
  const search = searchParams.search?.trim() || "";
  const status = searchParams.status || "all";

  let query = supabase
    .from("stories")
    .select("id, title, status, published_at, updated_at")
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const { data: stories } = await query;

  // load current slot assignments and recent published stories (last 30 days)
  const { data: slots } = await supabase.from("story_slots").select("slot, story_id");

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentPublished } = await supabase
    .from("stories")
    .select("id, title, published_at")
    .eq("status", "published")
    .gte("published_at", cutoff)
    .order("published_at", { ascending: false })
    .limit(100);

  return (
    <div className="grid gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Stories</h1>
          <p className="text-sm text-neutral-500">
            Search, filter, and manage published content.
          </p>
        </div>
        <Link
          href="/cms/stories/new"
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
        >
          New Story
        </Link>
      </header>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Homepage Slot Assignments</h2>
        <p className="text-sm text-neutral-500">Select stories published within the last 30 days.</p>
        <div className="mt-3 grid gap-3">
          {renderSlotSelector("hero", slots || [], recentPublished || [])}
          {renderSlotSelector("top1", slots || [], recentPublished || [])}
          {renderSlotSelector("top2", slots || [], recentPublished || [])}
          {renderSlotSelector("top3", slots || [], recentPublished || [])}
          {renderSlotSelector("top4", slots || [], recentPublished || [])}
        </div>
      </section>

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <input
          name="search"
          placeholder="Search titles"
          defaultValue={search}
          className="w-64 rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">All status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Apply
        </button>
      </form>

      <div className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Title</div>
          <div>Status</div>
          <div>Published</div>
          <div>Actions</div>
        </div>
        {(stories || []).map((story) => (
          <div
            key={story.id}
            className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
          >
            <div className="font-medium">{story.title || "(Untitled)"}</div>
            <div className="capitalize text-neutral-500">{story.status}</div>
            <div className="text-neutral-500">
              {story.published_at
                ? new Date(story.published_at).toLocaleDateString()
                : "-"}
            </div>
            <div className="flex gap-3 text-sm">
              <Link
                href={`/cms/stories/${story.id}`}
                className="text-neutral-900 underline"
              >
                Edit
              </Link>
              <UnpublishButton storyId={story.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function UnpublishButton({ storyId }: { storyId: string }) {
  async function unpublish() {
    "use server";
    const supabase = createServerSupabase();
    await supabase.from("stories").update({ status: "archived" }).eq("id", storyId);
    revalidatePath("/");
    revalidatePath("/cms/stories");
    redirect("/cms/stories");
  }

  return (
    <form action={unpublish}>
      <button type="submit" className="text-sm text-neutral-500 underline">
        Unpublish
      </button>
    </form>
  );
}

function renderSlotSelector(
  slot: string,
  slots: { slot: string; story_id: string | null }[],
  options: { id: string; title: string; published_at: string | null }[]
) {
  const current = slots.find((s) => s.slot === slot)?.story_id || "";

  async function updateSlot(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const slotValue = (formData.get("slot") as string) || slot;
    const storyId = (formData.get("storyId") as string) || "";

    if (!storyId) {
      await supabase.from("story_slots").delete().eq("slot", slotValue);
    } else {
      await supabase.from("story_slots").upsert({ slot: slotValue, story_id: storyId }, { onConflict: "slot" });
    }

    revalidatePath("/");
    revalidatePath("/cms/stories");
    redirect("/cms/stories");
  }

  return (
    <form key={slot} action={updateSlot} className="flex items-center gap-3">
      <input type="hidden" name="slot" value={slot} />
      <label className="w-28 text-sm font-medium capitalize">{slot}</label>
      <select name="storyId" defaultValue={current} className="rounded border border-neutral-300 px-3 py-2 text-sm">
        <option value="">None</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.title} {opt.published_at ? ` — ${new Date(opt.published_at).toLocaleDateString()}` : ""}
          </option>
        ))}
      </select>
      <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Save</button>
    </form>
  );
}
