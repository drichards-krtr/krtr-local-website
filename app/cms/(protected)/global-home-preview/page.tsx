import Link from "next/link";
import HomePageContent from "@/components/public/HomePageContent";

export const dynamic = "force-dynamic";

export default async function GlobalHomePreviewPage({
  searchParams,
}: {
  searchParams?: { debug?: string };
}) {
  return (
    <div className="-mx-8 -my-6 bg-neutral-100">
      <div className="border-b border-neutral-200 bg-white px-8 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Global Home Preview</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Previewing root-site homepage data with no DLPC fallback.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/cms" className="underline">
              Back to Dashboard
            </Link>
            <Link href="/cms/global-home-preview?debug=1" className="underline">
              Debug
            </Link>
          </div>
        </div>
      </div>
      <HomePageContent
        siteScopeKey="global"
        debug={searchParams?.debug === "1"}
        showDistrictBanners={false}
        trackAds={false}
        previewBanner={
          <section className="mb-6 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            This staging preview reads only records scoped to <strong>global</strong>. Missing
            stories, slots, ads, nominations, and voting data are left empty instead of falling
            back to DLPC.
          </section>
        }
      />
    </div>
  );
}
