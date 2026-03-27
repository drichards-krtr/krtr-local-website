import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { DISTRICT_OPTIONS, getDistrictConfig, parseDistrictKey, type DistrictKey } from "@/lib/districts";

type SitePage = {
  district_key?: DistrictKey;
  slug: "about" | "termsprivacy" | "advertise";
  title: string;
  body_markdown: string;
};

const PAGE_ORDER: Array<SitePage["slug"]> = ["about", "termsprivacy", "advertise"];

function revalidateSitePagePaths(districtKey: DistrictKey) {
  revalidatePath("/about");
  revalidatePath("/termsprivacy");
  revalidatePath("/advertise");
  revalidatePath("/cms/settings");
  revalidatePath(`/cms/settings?district=${districtKey}`);
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: { district?: string };
}) {
  const supabase = createServiceClient();
  const districtKey = parseDistrictKey(searchParams?.district) || "dlpc";
  const district = getDistrictConfig(districtKey);
  const { data } = await supabase
    .from("site_pages")
    .select("slug, title, body_markdown")
    .eq("district_key", districtKey)
    .in("slug", PAGE_ORDER);

  const pages = new Map<string, SitePage>();
  (data || []).forEach((row) => {
    pages.set(row.slug, row as SitePage);
  });

  async function saveSitePages(formData: FormData) {
    "use server";
    const service = createServiceClient();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const payload: SitePage[] = PAGE_ORDER.map((slug) => ({
      slug,
      title: String(formData.get(`${slug}_title`) || ""),
      body_markdown: String(formData.get(`${slug}_body`) || ""),
      district_key: nextDistrictKey,
    })) as SitePage[];
    await service.from("site_pages").upsert(payload, { onConflict: "district_key,slug" });
    revalidateSitePagePaths(nextDistrictKey);
    redirect(`/cms/settings?district=${nextDistrictKey}`);
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Advertise, Terms/Privacy, About</h1>
        <p className="text-sm text-neutral-500">Edit About, Terms/Privacy, and Advertise pages.</p>
        <p className="mt-1 text-sm text-neutral-600">Editing {district.name}.</p>
      </header>

      <form className="rounded border border-neutral-200 bg-white p-4">
        <label className="mb-2 block text-xs font-semibold uppercase text-neutral-500">District</label>
        <select
          name="district"
          defaultValue={districtKey}
          className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
          {DISTRICT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="ml-3 rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Switch
        </button>
      </form>

      <form action={saveSitePages} className="grid gap-6">
        <input type="hidden" name="district_key" value={districtKey} />
        {PAGE_ORDER.map((slug) => {
          const page = pages.get(slug);
          const fallbackTitle =
            slug === "about"
              ? `About ${district.metadata.siteName}`
              : slug === "termsprivacy"
                ? "Terms of Use"
                : `Advertise with ${district.metadata.siteName}`;
          return (
            <section key={slug} className="rounded border border-neutral-200 bg-white p-6">
              <h2 className="mb-3 text-lg font-semibold capitalize">{slug}</h2>
              <div className="grid gap-3">
                <label className="text-sm font-medium">Title</label>
                <input
                  name={`${slug}_title`}
                  defaultValue={page?.title || fallbackTitle}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <label className="text-sm font-medium">Content (Markdown)</label>
                <textarea
                  name={`${slug}_body`}
                  defaultValue={page?.body_markdown || ""}
                  className="min-h-[200px] rounded border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            </section>
          );
        })}
        <button
          type="submit"
          className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Save Page Content
        </button>
      </form>
    </div>
  );
}
