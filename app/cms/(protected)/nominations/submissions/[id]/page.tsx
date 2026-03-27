import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DISTRICT_OPTIONS, getDistrictConfig, parseDistrictKey, type DistrictKey } from "@/lib/districts";
import { createServerSupabase } from "@/lib/supabase/server";
import { NOMINATION_CATEGORY_LABELS, type NominationCategory } from "@/lib/nominations";

type NominationSubmission = {
  id: string;
  category: NominationCategory;
  submitter_name: string;
  submitter_email: string;
  submitter_phone: string;
  payload: Record<string, unknown>;
  submitted_at: string;
  district_key: DistrictKey;
};

function revalidateSubmissionPaths(districtKey: DistrictKey) {
  revalidatePath("/cms/nominations/submissions");
  revalidatePath(`/cms/nominations/submissions?district=${districtKey}`);
}

export default async function EditNominationSubmissionPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { district?: string; error?: string; success?: string };
}) {
  const districtKey = parseDistrictKey(searchParams?.district) || "dlpc";
  const district = getDistrictConfig(districtKey);
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("nomination_submissions")
    .select("id, category, submitter_name, submitter_email, submitter_phone, payload, submitted_at, district_key")
    .eq("id", params.id)
    .eq("district_key", districtKey)
    .maybeSingle();

  if (error) {
    throw new Error(`[EditNominationSubmissionPage] ${error.message}`);
  }
  if (!data) {
    return <p>Submission not found.</p>;
  }

  const row = data as NominationSubmission;

  async function save(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const payloadText = String(formData.get("payload") || "{}").trim();
    let parsedPayload: Record<string, unknown>;
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch {
      redirect(`/cms/nominations/submissions/${params.id}?district=${nextDistrictKey}&error=Payload must be valid JSON`);
    }

    const updatePayload = {
      district_key: nextDistrictKey,
      submitter_name: String(formData.get("submitter_name") || "").trim(),
      submitter_email: String(formData.get("submitter_email") || "").trim(),
      submitter_phone: String(formData.get("submitter_phone") || "").trim(),
      payload: parsedPayload,
    };

    const { error } = await supabase
      .from("nomination_submissions")
      .update(updatePayload)
      .eq("id", params.id)
      .eq("district_key", districtKey);

    if (error) {
      redirect(`/cms/nominations/submissions/${params.id}?district=${nextDistrictKey}&error=${encodeURIComponent(error.message)}`);
    }

    revalidateSubmissionPaths(nextDistrictKey);
    redirect(`/cms/nominations/submissions?district=${nextDistrictKey}&success=updated`);
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Edit Nomination Submission</h1>
          <p className="text-sm text-neutral-500">
            Category: {NOMINATION_CATEGORY_LABELS[row.category]}
          </p>
          <p className="mt-1 text-sm text-neutral-600">Editing {district.name}.</p>
        </div>
        <Link href={`/cms/nominations/submissions?district=${districtKey}`} className="text-sm underline">
          Back to Submissions
        </Link>
      </header>

      {searchParams?.error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {searchParams.error}
        </div>
      )}
      {searchParams?.success && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Submission updated.
        </div>
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

      <form action={save} className="grid gap-3 rounded border border-neutral-200 bg-white p-6">
        <input type="hidden" name="district_key" value={districtKey} />
        <div className="grid gap-1">
          <label className="text-sm font-medium">Submitter Name</label>
          <input
            name="submitter_name"
            defaultValue={row.submitter_name}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium">Submitter Email</label>
          <input
            name="submitter_email"
            defaultValue={row.submitter_email}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium">Submitter Phone</label>
          <input
            name="submitter_phone"
            defaultValue={row.submitter_phone}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium">Payload (JSON)</label>
          <textarea
            name="payload"
            defaultValue={JSON.stringify(row.payload || {}, null, 2)}
            className="min-h-[280px] rounded border border-neutral-300 px-3 py-2 font-mono text-xs"
          />
        </div>
        <button
          type="submit"
          className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Save Submission
        </button>
      </form>
    </div>
  );
}
