import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";

type SitePage = {
  slug: "about" | "termsprivacy" | "advertise";
  title: string;
  body_markdown: string;
};

const PAGE_ORDER: Array<SitePage["slug"]> = ["about", "termsprivacy", "advertise"];

export default async function SettingsPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("site_pages")
    .select("slug, title, body_markdown")
    .in("slug", PAGE_ORDER);

  const pages = new Map<string, SitePage>();
  (data || []).forEach((row) => {
    pages.set(row.slug, row as SitePage);
  });

  async function saveSitePages(formData: FormData) {
    "use server";
    const service = createServiceClient();
    const payload: SitePage[] = PAGE_ORDER.map((slug) => ({
      slug,
      title: String(formData.get(`${slug}_title`) || ""),
      body_markdown: String(formData.get(`${slug}_body`) || ""),
    }));
    await service.from("site_pages").upsert(payload, { onConflict: "slug" });
    revalidatePath("/about");
    revalidatePath("/termsprivacy");
    revalidatePath("/advertise");
    revalidatePath("/cms/settings");
    redirect("/cms/settings");
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-neutral-500">
          Edit About, Terms/Privacy, and Advertise pages.
        </p>
      </header>

      <form action={saveSitePages} className="grid gap-6">
        {PAGE_ORDER.map((slug) => {
          const page = pages.get(slug);
          const fallbackTitle =
            slug === "about"
              ? "About Us"
              : slug === "termsprivacy"
                ? "Terms of Use"
                : "Advertise with KRTR Local";
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
