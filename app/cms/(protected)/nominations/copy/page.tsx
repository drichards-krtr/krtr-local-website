import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

export default async function NominationCopyPage() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("nomination_copy")
    .select("category, title, body_markdown, submit_button_text, success_message");

  if (error) {
    throw new Error(`[NominationCopyPage] ${error.message}`);
  }

  const rows = new Map<string, NominationCopy>();
  ((data || []) as NominationCopy[]).forEach((row) => rows.set(row.category, row));

  async function saveCopy(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const payload = NOMINATION_CATEGORIES.map((category) => ({
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

    await supabase.from("nomination_copy").upsert(payload, { onConflict: "category" });
    revalidatePath("/cms/nominations/copy");
    revalidatePath("/nominations");
    redirect("/cms/nominations/copy");
  }

  return (
    <div className="grid gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Nomination Copy</h1>
          <p className="text-sm text-neutral-500">
            Edit the public copy shown for each nomination category.
          </p>
        </div>
        <Link href="/cms/nominations" className="text-sm underline">
          Back to Nominations
        </Link>
      </header>

      <form action={saveCopy} className="grid gap-6">
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
