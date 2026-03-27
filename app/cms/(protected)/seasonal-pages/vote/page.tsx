import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Markdown from "@/components/public/Markdown";
import ImageUploadField from "@/components/shared/ImageUploadField";
import { DISTRICT_OPTIONS, getDistrictConfig, parseDistrictKey, type DistrictKey } from "@/lib/districts";
import { createServerSupabase } from "@/lib/supabase/server";

type SeasonalPage = {
  slug: "vote";
  nav_enabled: boolean;
};

type VoteCandidate = {
  id: string;
  candidate_name: string;
  jurisdiction_name: string;
  seat_label: string | null;
  photo_url: string | null;
  link_1_url: string | null;
  link_1_text: string | null;
  link_2_url: string | null;
  link_2_text: string | null;
};

const DEFAULT_JURISDICTION_SLUG: Record<DistrictKey, string> = {
  dlpc: "union-community-school-district-school-board",
  vs: "vinton-shellsburg-school-board",
  bc: "benton-community-school-board",
};

function revalidateVotePaths(districtKey: DistrictKey) {
  revalidatePath("/", "layout");
  revalidatePath("/vote");
  revalidatePath("/cms/seasonal-pages");
  revalidatePath(`/cms/seasonal-pages?district=${districtKey}`);
  revalidatePath("/cms/seasonal-pages/vote");
  revalidatePath(`/cms/seasonal-pages/vote?district=${districtKey}`);
}

export default async function SeasonalVoteCms({
  searchParams,
}: {
  searchParams?: { district?: string; error?: string; success?: string };
}) {
  const districtKey = parseDistrictKey(searchParams?.district) || "dlpc";
  const district = getDistrictConfig(districtKey);
  const supabase = createServerSupabase();
  const [{ data: pageData }, { data: copyData }, { data: candidatesData }] =
    await Promise.all([
      supabase
        .from("seasonal_pages")
        .select("slug, nav_enabled")
        .eq("district_key", districtKey)
        .eq("slug", "vote")
        .maybeSingle(),
      supabase
        .from("vote_page_content")
        .select("body_markdown")
        .eq("district_key", districtKey)
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("vote_candidates")
        .select(
          "id, candidate_name, jurisdiction_name, seat_label, photo_url, link_1_url, link_1_text, link_2_url, link_2_text"
        )
        .eq("district_key", districtKey)
        .order("jurisdiction_name", { ascending: true })
        .order("candidate_name", { ascending: true }),
    ]);

  const page = (pageData as SeasonalPage | null) || {
    slug: "vote",
    nav_enabled: false,
  };
  const bodyMarkdown = String(copyData?.body_markdown || "");
  const candidates = (candidatesData || []) as VoteCandidate[];

  async function saveSettings(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;

    const pageResult = await service.from("seasonal_pages").upsert(
      {
        district_key: nextDistrictKey,
        slug: "vote",
        title: "VOTE",
        nav_label: "VOTE",
        nav_enabled: formData.get("nav_enabled") === "on",
      },
      { onConflict: "district_key,slug" }
    );
    if (pageResult.error) {
      redirect(`/cms/seasonal-pages/vote?district=${nextDistrictKey}&error=${encodeURIComponent(pageResult.error.message)}`);
    }

    const copyResult = await service.from("vote_page_content").upsert(
      {
        district_key: nextDistrictKey,
        id: 1,
        body_markdown: String(formData.get("body_markdown") || ""),
      },
      { onConflict: "district_key,id" }
    );
    if (copyResult.error) {
      redirect(`/cms/seasonal-pages/vote?district=${nextDistrictKey}&error=${encodeURIComponent(copyResult.error.message)}`);
    }

    revalidateVotePaths(nextDistrictKey);
    redirect(`/cms/seasonal-pages/vote?district=${nextDistrictKey}&success=settings`);
  }

  async function addCandidate(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const result = await service.from("vote_candidates").insert({
      district_key: nextDistrictKey,
      jurisdiction_name: String(formData.get("jurisdiction_name") || "").trim(),
      seat_label: String(formData.get("seat_label") || "").trim() || null,
      candidate_name: String(formData.get("candidate_name") || "").trim(),
      photo_url: String(formData.get("photo_url") || "").trim() || null,
      link_1_url: String(formData.get("link_1_url") || "").trim() || null,
      link_1_text: String(formData.get("link_1_text") || "").trim() || null,
      link_2_url: String(formData.get("link_2_url") || "").trim() || null,
      link_2_text: String(formData.get("link_2_text") || "").trim() || null,
      jurisdiction_slug: DEFAULT_JURISDICTION_SLUG[nextDistrictKey],
      seat_id: null,
      sort_order: 1,
    });

    if (result.error) {
      redirect(`/cms/seasonal-pages/vote?district=${nextDistrictKey}&error=${encodeURIComponent(result.error.message)}`);
    }

    revalidateVotePaths(nextDistrictKey);
    redirect(`/cms/seasonal-pages/vote?district=${nextDistrictKey}&success=candidate-added`);
  }

  async function updateCandidate(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id") || "");
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const result = await service
      .from("vote_candidates")
      .update({
        district_key: nextDistrictKey,
        jurisdiction_name: String(formData.get("jurisdiction_name") || "").trim(),
        seat_label: String(formData.get("seat_label") || "").trim() || null,
        candidate_name: String(formData.get("candidate_name") || "").trim(),
        photo_url: String(formData.get("photo_url") || "").trim() || null,
        link_1_url: String(formData.get("link_1_url") || "").trim() || null,
        link_1_text: String(formData.get("link_1_text") || "").trim() || null,
        link_2_url: String(formData.get("link_2_url") || "").trim() || null,
        link_2_text: String(formData.get("link_2_text") || "").trim() || null,
      })
      .eq("id", id)
      .eq("district_key", districtKey);

    if (result.error) {
      redirect(`/cms/seasonal-pages/vote?district=${nextDistrictKey}&error=${encodeURIComponent(result.error.message)}`);
    }

    revalidateVotePaths(nextDistrictKey);
    redirect(`/cms/seasonal-pages/vote?district=${nextDistrictKey}&success=candidate-updated`);
  }

  async function deleteCandidate(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id") || "");
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const result = await service
      .from("vote_candidates")
      .delete()
      .eq("id", id)
      .eq("district_key", districtKey);

    if (result.error) {
      redirect(`/cms/seasonal-pages/vote?district=${nextDistrictKey}&error=${encodeURIComponent(result.error.message)}`);
    }

    revalidateVotePaths(nextDistrictKey);
    redirect(`/cms/seasonal-pages/vote?district=${nextDistrictKey}&success=candidate-deleted`);
  }

  return (
    <div className="grid gap-8">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">VOTE</h1>
          <p className="text-sm text-neutral-500">Dedicated CMS editor for the VOTE page.</p>
        </div>
        <Link href={`/cms/seasonal-pages?district=${districtKey}`} className="text-sm underline">
          Back to Seasonal Pages
        </Link>
      </header>

      {searchParams?.error && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {searchParams.error}
        </p>
      )}
      {searchParams?.success && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </p>
      )}

      <form className="rounded border border-neutral-200 bg-white p-4">
        <label className="mb-2 block text-xs font-semibold uppercase text-neutral-500">District</label>
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
        <button
          type="submit"
          className="ml-3 rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Switch
        </button>
      </form>

      <section className="rounded border border-neutral-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold">Page Settings</h2>
        <p className="mb-4 text-sm text-neutral-500">Editing {district.name}.</p>
        <form action={saveSettings} className="grid gap-3">
          <input type="hidden" name="district_key" value={districtKey} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="nav_enabled" defaultChecked={page.nav_enabled} />
            Show VOTE in main nav
          </label>
          <label className="text-sm font-medium">Page Copy (Markdown)</label>
          <textarea
            name="body_markdown"
            defaultValue={bodyMarkdown}
            className="min-h-[220px] rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          {bodyMarkdown && (
            <div className="rounded border border-neutral-200 bg-neutral-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Current Preview
              </p>
              <Markdown content={bodyMarkdown} />
            </div>
          )}
          <button
            type="submit"
            className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Save Settings
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold">Vote Candidates</h2>
        <form action={addCandidate} className="mb-6 grid gap-3 rounded border border-neutral-200 p-4 md:grid-cols-2">
          <input type="hidden" name="district_key" value={districtKey} />
          <input
            name="jurisdiction_name"
            placeholder="Jurisdiction"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="seat_label"
            placeholder="Seat Assignment"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="candidate_name"
            placeholder="Candidate Name"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
          />
          <div className="md:col-span-2">
            <ImageUploadField name="photo_url" label="Candidate Photo" folder="krtr/vote" />
          </div>
          <input
            name="link_1_url"
            placeholder="Candidate Link 1 URL"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="link_1_text"
            placeholder="Candidate Link 1 Text"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="link_2_url"
            placeholder="Candidate Link 2 URL"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="link_2_text"
            placeholder="Candidate Link 2 Text"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white md:col-span-2"
          >
            Add Candidate
          </button>
        </form>

        <div className="grid gap-4">
          {candidates.map((candidate) => (
            <form
              key={candidate.id}
              action={updateCandidate}
              className="grid gap-3 rounded border border-neutral-200 p-4 md:grid-cols-2"
            >
              <input type="hidden" name="id" value={candidate.id} />
              <input type="hidden" name="district_key" value={districtKey} />
              <input
                name="jurisdiction_name"
                defaultValue={candidate.jurisdiction_name}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="seat_label"
                defaultValue={candidate.seat_label || ""}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="candidate_name"
                defaultValue={candidate.candidate_name}
                className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
              />
              <div className="md:col-span-2">
                <ImageUploadField
                  name="photo_url"
                  label="Candidate Photo"
                  folder="krtr/vote"
                  initialUrl={candidate.photo_url || ""}
                />
              </div>
              <input
                name="link_1_url"
                defaultValue={candidate.link_1_url || ""}
                placeholder="Candidate Link 1 URL"
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="link_1_text"
                defaultValue={candidate.link_1_text || ""}
                placeholder="Candidate Link 1 Text"
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="link_2_url"
                defaultValue={candidate.link_2_url || ""}
                placeholder="Candidate Link 2 URL"
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="link_2_text"
                defaultValue={candidate.link_2_text || ""}
                placeholder="Candidate Link 2 Text"
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-3 md:col-span-2">
                <button
                  type="submit"
                  className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
                >
                  Save Candidate
                </button>
                <button
                  formAction={deleteCandidate}
                  type="submit"
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
