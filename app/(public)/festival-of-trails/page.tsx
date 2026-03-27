import Markdown from "@/components/public/Markdown";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentDistrict } from "@/lib/districtServer";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

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

export default async function FestivalOfTrailsPage() {
  const district = getCurrentDistrict();
  if (!district.features.festivalOfTrails) {
    notFound();
  }
  const supabase = createPublicClient();
  const [{ data: contentData }, { data: linksData }] = await Promise.all([
    supabase
      .from("festival_of_trails_content")
      .select("body_markdown, photo_url, photo_active, video_url, video_active")
      .eq("district_key", district.key)
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("festival_of_trails_links")
      .select("id, link_text, link_url, priority")
      .eq("district_key", district.key)
      .order("priority", { ascending: true }),
  ]);

  const content = (contentData as FestivalContent | null) || {
    body_markdown: "",
    photo_url: null,
    photo_active: false,
    video_url: null,
    video_active: false,
  };
  const links = (linksData || []) as FestivalLink[];

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="rounded-lg bg-white p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Festival of Trails</h1>
        </header>

        {content.body_markdown && <Markdown content={content.body_markdown} />}

        {content.photo_active && content.photo_url && (
          <img
            src={content.photo_url}
            alt="Festival of Trails"
            className="mt-4 max-h-[420px] w-full rounded border border-neutral-200 object-contain"
          />
        )}

        {content.video_active && content.video_url && (
          <video
            controls
            src={content.video_url}
            className="mt-4 max-h-[480px] w-full rounded border border-neutral-200"
          />
        )}

        {links.length > 0 && (
          <div className="mt-6 grid gap-2">
            <h2 className="text-lg font-semibold">Links</h2>
            {links.map((link) => (
              <a
                key={link.id}
                href={link.link_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold underline"
              >
                {link.link_text}
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
