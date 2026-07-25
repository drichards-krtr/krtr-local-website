import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatDateInTimeZone } from "@/lib/dates";
import { DISTRICT_OPTIONS, parseDistrictKey, type DistrictKey } from "@/lib/districts";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function DailysPage({
  searchParams,
}: {
  searchParams: { search?: string; status?: string; district?: string };
}) {
  const supabase = createServerSupabase();
  const search = searchParams.search?.trim() || "";
  const status = searchParams.status || "all";
  const districtKey = parseDistrictKey(searchParams.district) || "dlpc";

  let query = supabase
    .from("dailys")
    .select("id, district_key, title, status, published_at, updated_at, slug")
    .eq("district_key", districtKey)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const { data: dailys } = await query;

  return (
    <div className="grid gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Daily&apos;s</h1>
          <p className="text-sm text-neutral-500">Search, filter, and manage Daily videos.</p>
        </div>
        <Link
          href={`/cms/dailys/new?district=${districtKey}`}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
        >
          New Daily
        </Link>
      </header>

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <select
          name="district"
          defaultValue={districtKey}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {DISTRICT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
        {(dailys || []).map((daily) => (
          <div
            key={daily.id}
            className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
          >
            <div className="font-medium">{daily.title || "(Untitled)"}</div>
            <div className="capitalize text-neutral-500">
              {daily.status === "published" &&
              daily.published_at &&
              new Date(daily.published_at).getTime() > Date.now()
                ? "Scheduled"
                : daily.status}
            </div>
            <div className="text-neutral-500">
              {daily.published_at ? formatDateInTimeZone(daily.published_at) : "-"}
            </div>
            <div className="flex gap-3 text-sm">
              <Link href={`/cms/dailys/${daily.id}?district=${districtKey}`} className="text-neutral-900 underline">
                Edit
              </Link>
              {daily.slug && daily.status === "published" && (
                <a href={`/${daily.slug}`} target="_blank" rel="noreferrer" className="text-neutral-900 underline">
                  View
                </a>
              )}
              <UnpublishButton dailyId={daily.id} districtKey={districtKey} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function UnpublishButton({ dailyId, districtKey }: { dailyId: string; districtKey: DistrictKey }) {
  async function unpublish() {
    "use server";
    const supabase = createServerSupabase();
    await supabase
      .from("dailys")
      .update({ status: "archived" })
      .eq("id", dailyId)
      .eq("district_key", districtKey);
    revalidatePath("/");
    revalidatePath("/cms/dailys");
    redirect(`/cms/dailys?district=${districtKey}`);
  }

  return (
    <form action={unpublish}>
      <button type="submit" className="text-sm text-neutral-500 underline">
        Unpublish
      </button>
    </form>
  );
}
