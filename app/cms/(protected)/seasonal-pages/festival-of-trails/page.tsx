import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import ImageUploadField from "@/components/shared/ImageUploadField";
import VideoUploadField from "@/components/shared/VideoUploadField";
import { createServerSupabase } from "@/lib/supabase/server";

type SeasonalPage = {
  slug: "festival-of-trails";
  nav_enabled: boolean;
};

type FestivalContent = {
  body_markdown: string;
  photo_url: string | null;
  photo_active: boolean;
  video_url: string | null;
  video_active: boolean;
};

type FestivalLink = {
  id: string;
  link_text: string;
  link_url: string;
  priority: number;
};

function toInt(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function revalidateFestivalPaths() {
  revalidatePath("/", "layout");
  revalidatePath("/festival-of-trails");
  revalidatePath("/cms/seasonal-pages");
  revalidatePath("/cms/seasonal-pages/festival-of-trails");
}

export default async function SeasonalFestivalCms({
  searchParams,
}: {
  searchParams: { error?: string; success?: string };
}) {
  const supabase = createServerSupabase();
  const [{ data: pageData }, { data: contentData }, { data: linksData }] =
    await Promise.all([
      supabase
        .from("seasonal_pages")
        .select("slug, nav_enabled")
        .eq("slug", "festival-of-trails")
        .maybeSingle(),
      supabase
        .from("festival_of_trails_content")
        .select("body_markdown, photo_url, photo_active, video_url, video_active")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("festival_of_trails_links")
        .select("id, link_text, link_url, priority")
        .order("priority", { ascending: true }),
    ]);

  const page = (pageData as SeasonalPage | null) || {
    slug: "festival-of-trails",
    nav_enabled: false,
  };
  const content = (contentData as FestivalContent | null) || {
    body_markdown: "",
    photo_url: null,
    photo_active: false,
    video_url: null,
    video_active: false,
  };
  const links = (linksData || []) as FestivalLink[];
  const priorityOptions = Array.from(
    { length: Math.max(100, links.length + 20) },
    (_, index) => index + 1
  );

  async function saveSettings(formData: FormData) {
    "use server";
    const service = createServerSupabase();

    const pageResult = await service.from("seasonal_pages").upsert(
      {
        slug: "festival-of-trails",
        title: "Festival of Trails",
        nav_label: "Festival of Trails",
        nav_enabled: formData.get("nav_enabled") === "on",
      },
      { onConflict: "slug" }
    );
    if (pageResult.error) {
      redirect(
        `/cms/seasonal-pages/festival-of-trails?error=${encodeURIComponent(pageResult.error.message)}`
      );
    }

    const contentResult = await service
      .from("festival_of_trails_content")
      .upsert(
        {
          id: 1,
          body_markdown: String(formData.get("body_markdown") || ""),
          photo_url: String(formData.get("photo_url") || "").trim() || null,
          photo_active: formData.get("photo_active") === "on",
          video_url: String(formData.get("video_url") || "").trim() || null,
          video_active: formData.get("video_active") === "on",
        },
        { onConflict: "id" }
      );
    if (contentResult.error) {
      redirect(
        `/cms/seasonal-pages/festival-of-trails?error=${encodeURIComponent(contentResult.error.message)}`
      );
    }

    revalidateFestivalPaths();
    redirect("/cms/seasonal-pages/festival-of-trails?success=settings");
  }

  async function addLink(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const priority = Math.max(1, toInt(formData.get("priority"), 1));
    const { data: existing } = await service
      .from("festival_of_trails_links")
      .select("id")
      .eq("priority", priority)
      .maybeSingle();
    if (existing) {
      redirect("/cms/seasonal-pages/festival-of-trails?error=Priority already in use.");
    }

    const result = await service.from("festival_of_trails_links").insert({
      link_text: String(formData.get("link_text") || "").trim(),
      link_url: String(formData.get("link_url") || "").trim(),
      priority,
    });
    if (result.error) {
      redirect(
        `/cms/seasonal-pages/festival-of-trails?error=${encodeURIComponent(result.error.message)}`
      );
    }

    revalidateFestivalPaths();
    redirect("/cms/seasonal-pages/festival-of-trails?success=link-added");
  }

  async function updateLink(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id") || "");
    const priority = Math.max(1, toInt(formData.get("priority"), 1));
    const { data: existing } = await service
      .from("festival_of_trails_links")
      .select("id")
      .eq("priority", priority)
      .neq("id", id)
      .maybeSingle();
    if (existing) {
      redirect("/cms/seasonal-pages/festival-of-trails?error=Priority already in use.");
    }

    const result = await service
      .from("festival_of_trails_links")
      .update({
        link_text: String(formData.get("link_text") || "").trim(),
        link_url: String(formData.get("link_url") || "").trim(),
        priority,
      })
      .eq("id", id);
    if (result.error) {
      redirect(
        `/cms/seasonal-pages/festival-of-trails?error=${encodeURIComponent(result.error.message)}`
      );
    }

    revalidateFestivalPaths();
    redirect("/cms/seasonal-pages/festival-of-trails?success=link-updated");
  }

  async function deleteLink(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id") || "");
    const result = await service.from("festival_of_trails_links").delete().eq("id", id);
    if (result.error) {
      redirect(
        `/cms/seasonal-pages/festival-of-trails?error=${encodeURIComponent(result.error.message)}`
      );
    }

    revalidateFestivalPaths();
    redirect("/cms/seasonal-pages/festival-of-trails?success=link-deleted");
  }

  return (
    <div className="grid gap-8">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Festival of Trails</h1>
          <p className="text-sm text-neutral-500">
            Dedicated CMS editor for the Festival of Trails page.
          </p>
        </div>
        <Link href="/cms/seasonal-pages" className="text-sm underline">
          Back to Seasonal Pages
        </Link>
      </header>

      {searchParams.error && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {searchParams.error}
        </p>
      )}
      {searchParams.success && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </p>
      )}

      <section className="rounded border border-neutral-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold">Page Settings</h2>
        <form action={saveSettings} className="grid gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="nav_enabled" defaultChecked={page.nav_enabled} />
            Show Festival of Trails in main nav
          </label>
          <label className="text-sm font-medium">Page Content (Markdown)</label>
          <textarea
            name="body_markdown"
            defaultValue={content.body_markdown}
            className="min-h-[220px] rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <ImageUploadField
            name="photo_url"
            label="Festival Photo"
            folder="krtr/festival-of-trails"
            initialUrl={content.photo_url || ""}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="photo_active" defaultChecked={content.photo_active} />
            Photo Active
          </label>
          <VideoUploadField
            name="video_url"
            label="Festival Video"
            folder="krtr/festival-of-trails"
            initialUrl={content.video_url || ""}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="video_active" defaultChecked={content.video_active} />
            Video Active
          </label>
          <button
            type="submit"
            className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Save Settings
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold">Festival Links</h2>
        <form action={addLink} className="mb-6 grid gap-3 md:grid-cols-3">
          <input
            name="link_text"
            placeholder="Link Text"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="link_url"
            placeholder="Link URL"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <select
            name="priority"
            defaultValue={1}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            {priorityOptions.map((priority) => (
              <option key={priority} value={priority}>
                Priority {priority}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white md:col-span-3"
          >
            Add Link
          </button>
        </form>

        <div className="grid gap-4">
          {links.map((link) => (
            <form
              key={link.id}
              action={updateLink}
              className="grid gap-3 rounded border border-neutral-200 p-4 md:grid-cols-4"
            >
              <input type="hidden" name="id" value={link.id} />
              <input
                name="link_text"
                defaultValue={link.link_text}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="link_url"
                defaultValue={link.link_url}
                className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
              />
              <select
                name="priority"
                defaultValue={link.priority}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                {priorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    Priority {priority}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-3 md:col-span-4">
                <button
                  type="submit"
                  className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
                >
                  Save Link
                </button>
                <button
                  type="submit"
                  formAction={deleteLink}
                  className="text-sm underline"
                >
                  Delete
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
