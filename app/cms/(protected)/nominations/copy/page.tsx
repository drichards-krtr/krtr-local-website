import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DISTRICT_OPTIONS, getDistrictConfig, parseDistrictKey, type DistrictKey } from "@/lib/districts";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  NOMINATION_CATEGORIES,
  NOMINATION_CATEGORY_LABELS,
  type NominationCategory,
} from "@/lib/nominations";

type NominationCopy = {
  category: NominationCategory;
  title: string;
  body_markdown: string;
  submit_button_text: string;
  success_message: string;
};

function revalidateNominationCopyPaths(districtKey: DistrictKey) {
  revalidatePath("/cms/nominations/copy");
  revalidatePath(`/cms/nominations/copy?district=${districtKey}`);
  revalidatePath("/nominations");
}

export default async function NominationCopyPage({
  searchParams,
}: {
  searchParams?: { district?: string };
}) {
  const districtKey = parseDistrictKey(searchParams?.district) || "dlpc";
  const district = getDistrictConfig(districtKey);
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("nomination_copy")
    .select("category, title, body_markdown, submit_button_text, success_message")
    .eq("district_key", districtKey);

  if (error) {
    throw new Error(`[NominationCopyPage] ${error.message}`);
  }

  const rows = new Map<string, NominationCopy>();
  ((data || []) as NominationCopy[]).forEach((row) => rows.set(row.category, row));

  async function saveCopy(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const payload = NOMINATION_CATEGORIES.map((category) => ({
      district_key: nextDistrictKey,
      category,
      title: String(formData.get(`${category}_title`) || "").trim(),
      body_markdown: String(formData.get(`${category}_body_markdown`) || "").trim(),
      submit_button_text:
        String(formData.get(`${category}_submit_button_text`) || "").trim() ||
        "Submit Nomination",
      success_message:
        String(formData.get(`${category}_success_message`) || "").trim() ||
        "Thank You For Nominating",
    }));

    await supabase.from("nomination_copy").upsert(payload, { onConflict: "district_key,category" });
    revalidateNominationCopyPaths(nextDistrictKey);
    redirect(`/cms/nominations/copy?district=${nextDistrictKey}`);
  }

  return (
    <div className="grid gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Nomination Copy</h1>
          <p className="text-sm text-neutral-500">
            Edit the public copy shown for each nomination category.
          </p>
          <p className="mt-1 text-sm text-neutral-600">Editing {district.name}.</p>
        </div>
        <Link href={`/cms/nominations?district=${districtKey}`} className="text-sm underline">
          Back to Nominations
        </Link>
      </header>

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

      <form action={saveCopy} className="grid gap-6">
        <input type="hidden" name="district_key" value={districtKey} />
        {NOMINATION_CATEGORIES.map((category) => {
          const row = rows.get(category);
          return (
            <section key={category} className="rounded border border-neutral-200 bg-white p-6">
              <h2 className="mb-3 text-lg font-semibold">{NOMINATION_CATEGORY_LABELS[category]}</h2>
              <div className="grid gap-3">
                <label className="text-sm font-medium">Title</label>
                <input
                  name={`${category}_title`}
                  defaultValue={row?.title || `${NOMINATION_CATEGORY_LABELS[category]} Nominations`}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <label className="text-sm font-medium">Body Copy (Markdown)</label>
                <textarea
                  name={`${category}_body_markdown`}
                  defaultValue={row?.body_markdown || ""}
                  className="min-h-[140px] rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <label className="text-sm font-medium">Submit Button Text</label>
                <input
                  name={`${category}_submit_button_text`}
                  defaultValue={row?.submit_button_text || "Submit Nomination"}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <label className="text-sm font-medium">Success Message</label>
                <input
                  name={`${category}_success_message`}
                  defaultValue={row?.success_message || "Thank You For Nominating"}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            </section>
          );
        })}
        <button
          type="submit"
          className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Save Copy
        </button>
      </form>
    </div>
  );
}
