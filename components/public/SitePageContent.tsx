import Markdown from "@/components/public/Markdown";
import { createPublicClient } from "@/lib/supabase/public";

export default async function SitePageContent({ slug }: { slug: "about" | "termsprivacy" | "advertise" }) {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("site_pages")
    .select("title, body_markdown")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`[SitePageContent:${slug}] ${error.message}`);
  }

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <article className="rounded-lg bg-white p-6">
        <h1 className="mb-4 text-2xl font-semibold">{data?.title || "Page"}</h1>
        <Markdown content={data?.body_markdown || ""} />
      </article>
    </main>
  );
}
