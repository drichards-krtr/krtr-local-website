import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DISTRICT_OPTIONS, getDistrictConfig, parseDistrictKey, type DistrictKey } from "@/lib/districts";
import { createServerSupabase } from "@/lib/supabase/server";
import { NOMINATION_CATEGORY_LABELS, type NominationCategory } from "@/lib/nominations";

type Nomination = {
  id: string;
  category: NominationCategory;
  open_date: string;
  close_date: string;
  status_override: "auto" | "force_open" | "force_closed";
};

function getErrorMessage(error: string) {
  if (error.includes("overlaps")) {
    return "Date range overlaps an existing nomination in this district. Only one nomination can be open at once per district.";
  }
  if (error.includes("locked")) {
    return "Category is locked after creation.";
  }
  if (error.includes("nominations_one_force_open_idx")) {
    return "Only one nomination can be forced open at a time within the selected district.";
  }
  return error;
}

function revalidateNominationPaths(districtKey: DistrictKey) {
  revalidatePath("/cms/nominations");
  revalidatePath(`/cms/nominations?district=${districtKey}`);
  revalidatePath("/nominations");
}

export default async function EditNominationPage({
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
    .from("nominations")
    .select("id, category, open_date, close_date, status_override")
    .eq("id", params.id)
    .eq("district_key", districtKey)
    .maybeSingle();

  if (error) {
    throw new Error(`[EditNominationPage] ${error.message}`);
  }
  if (!data) {
    return <p>Nomination not found.</p>;
  }

  const nomination = data as Nomination;

  async function saveNomination(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const payload = {
      district_key: nextDistrictKey,
      open_date: String(formData.get("open_date") || ""),
      close_date: String(formData.get("close_date") || ""),
      status_override: String(formData.get("status_override") || "auto"),
    };

    const { error } = await supabase
      .from("nominations")
      .update(payload)
      .eq("id", params.id)
      .eq("district_key", districtKey);
    if (error) {
      redirect(`/cms/nominations/${params.id}?district=${nextDistrictKey}&error=${encodeURIComponent(error.message)}`);
    }
    revalidateNominationPaths(nextDistrictKey);
    redirect(`/cms/nominations?district=${nextDistrictKey}&success=updated`);
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Edit Nomination</h1>
          <p className="text-sm text-neutral-500">Category is locked once created.</p>
          <p className="mt-1 text-sm text-neutral-600">Editing {district.name}.</p>
        </div>
        <Link href={`/cms/nominations?district=${districtKey}`} className="text-sm underline">
          Back to Nominations
        </Link>
      </header>

      {searchParams?.error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {getErrorMessage(searchParams.error)}
        </div>
      )}
      {searchParams?.success && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Nomination updated.
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

      <form action={saveNomination} className="grid gap-3 rounded border border-neutral-200 bg-white p-6 md:grid-cols-2">
        <input type="hidden" name="district_key" value={districtKey} />
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">Category</label>
          <input
            value={NOMINATION_CATEGORY_LABELS[nomination.category]}
            disabled
            className="w-full rounded border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-700"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Open Date</label>
          <input
            name="open_date"
            type="date"
            defaultValue={nomination.open_date}
            required
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Close Date</label>
          <input
            name="close_date"
            type="date"
            defaultValue={nomination.close_date}
            required
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">Status Override</label>
          <select
            name="status_override"
            defaultValue={nomination.status_override}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="auto">Auto (date-based)</option>
            <option value="force_open">Force Open</option>
            <option value="force_closed">Force Closed</option>
          </select>
        </div>

        <button
          type="submit"
          className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Save Nomination
        </button>
      </form>
    </div>
  );
}
