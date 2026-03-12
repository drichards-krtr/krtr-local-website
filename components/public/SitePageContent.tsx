import Markdown from "@/components/public/Markdown";
import { getSitePage, type SitePageSlug } from "@/lib/site-pages";

export default async function SitePageContent({ slug }: { slug: SitePageSlug }) {
  const data = await getSitePage(slug);

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <article className="rounded-lg bg-white p-6">
        <h1 className="mb-4 text-2xl font-semibold">{data?.title || "Page"}</h1>
        <Markdown content={data?.body_markdown || ""} />
      </article>
    </main>
  );
}
