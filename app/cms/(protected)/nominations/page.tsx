import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DISTRICT_OPTIONS, getDistrictConfig, parseDistrictKey, type DistrictKey } from "@/lib/districts";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  NOMINATION_CATEGORIES,
  NOMINATION_CATEGORY_LABELS,
  nominationIsOpenInCentralTime,
  type NominationCategory,
} from "@/lib/nominations";

type Nomination = {
  id: string;
  category: NominationCategory;
  open_date: string;
  close_date: string;
  status_override: "auto" | "force_open" | "force_closed";
  created_at: string;
};

function getErrorMessage(error: string) {
  if (error.includes("overlaps")) {
    return "Date range overlaps an existing nomination in this district. Only one nomination can be open at once per district.";
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

export default async function NominationsPage({
  searchParams,
}: {
  searchParams?: { district?: string; error?: string; success?: string };
}) {
  const districtKey = parseDistrictKey(searchParams?.district) || "dlpc";
  const district = getDistrictConfig(districtKey);
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("nominations")
    .select("id, category, open_date, close_date, status_override, created_at")
    .eq("district_key", districtKey)
    .order("open_date", { ascending: false });

  if (error) {
    throw new Error(`[CmsNominationsPage] ${error.message}`);
  }

  const nominations = (data || []) as Nomination[];

  async function createNomination(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;

    const payload = {
      district_key: nextDistrictKey,
      category: String(formData.get("category") || "") as NominationCategory,
      open_date: String(formData.get("open_date") || ""),
      close_date: String(formData.get("close_date") || ""),
      status_override: String(formData.get("status_override") || "auto"),
    };

    const { error } = await supabase.from("nominations").insert(payload);
    if (error) {
      redirect(`/cms/nominations?district=${nextDistrictKey}&error=${encodeURIComponent(error.message)}`);
    }

    revalidateNominationPaths(nextDistrictKey);
    redirect(`/cms/nominations?district=${nextDistrictKey}&success=created`);
  }

  async function quickUpdate(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const id = String(formData.get("id") || "");
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const statusOverride = String(formData.get("status_override") || "auto");

    const { error } = await supabase
      .from("nominations")
      .update({ status_override: statusOverride })
      .eq("id", id)
      .eq("district_key", districtKey);

    if (error) {
      redirect(`/cms/nominations?district=${nextDistrictKey}&error=${encodeURIComponent(error.message)}`);
    }

    revalidateNominationPaths(nextDistrictKey);
    redirect(`/cms/nominations?district=${nextDistrictKey}&success=updated`);
  }

  async function deleteNomination(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const id = String(formData.get("id") || "");
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const { error } = await supabase.from("nominations").delete().eq("id", id).eq("district_key", districtKey);
    if (error) {
      redirect(`/cms/nominations?district=${nextDistrictKey}&error=${encodeURIComponent(error.message)}`);
    }
    revalidateNominationPaths(nextDistrictKey);
    redirect(`/cms/nominations?district=${nextDistrictKey}&success=deleted`);
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Nominations</h1>
          <p className="text-sm text-neutral-500">
            Create nomination windows and control what appears at <code>/nominations</code>.
          </p>
          <p className="mt-1 text-sm text-neutral-600">Editing {district.name}.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/cms/nominations/copy?district=${districtKey}`}
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900"
          >
            Edit Category Copy
          </Link>
          <Link
            href={`/cms/nominations/submissions?district=${districtKey}`}
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900"
          >
            View Submissions
          </Link>
        </div>
      </header>

      {searchParams?.error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {getErrorMessage(searchParams.error)}
        </div>
      )}
      {searchParams?.success && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Nomination saved.
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

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Create New Nomination</h2>
        <form action={createNomination} className="grid gap-3 md:grid-cols-4">
          <input type="hidden" name="district_key" value={districtKey} />
          <input
            name="open_date"
            type="date"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="close_date"
            type="date"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <select
            name="category"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            {NOMINATION_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {NOMINATION_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
          <select
            name="status_override"
            defaultValue="auto"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="auto">Auto (date-based)</option>
            <option value="force_open">Force Open</option>
            <option value="force_closed">Force Closed</option>
          </select>
          <button
            type="submit"
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white md:col-span-4 md:w-fit"
          >
            Create Nomination
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Category</div>
          <div>Open</div>
          <div>Close</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {nominations.length === 0 && (
          <div className="px-4 py-6 text-sm text-neutral-500">No nominations yet.</div>
        )}
        {nominations.map((nomination) => {
          const isOpen = nominationIsOpenInCentralTime(nomination);
          const statusText =
            nomination.status_override === "force_open"
              ? "Force Open"
              : nomination.status_override === "force_closed"
                ? "Force Closed"
                : isOpen
                  ? "Open"
                  : "Closed";
          return (
            <div
              key={nomination.id}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
            >
              <div className="font-medium">{NOMINATION_CATEGORY_LABELS[nomination.category]}</div>
              <div className="text-neutral-600">{nomination.open_date}</div>
              <div className="text-neutral-600">{nomination.close_date}</div>
              <div className="text-neutral-700">{statusText}</div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/cms/nominations/${nomination.id}?district=${districtKey}`} className="underline">
                  Edit
                </Link>
                <form action={quickUpdate}>
                  <input type="hidden" name="id" value={nomination.id} />
                  <input type="hidden" name="district_key" value={districtKey} />
                  <input type="hidden" name="status_override" value="auto" />
                  <button type="submit" className="text-neutral-500 underline">
                    Auto
                  </button>
                </form>
                <form action={quickUpdate}>
                  <input type="hidden" name="id" value={nomination.id} />
                  <input type="hidden" name="district_key" value={districtKey} />
                  <input type="hidden" name="status_override" value="force_open" />
                  <button type="submit" className="text-neutral-500 underline">
                    Force Open
                  </button>
                </form>
                <form action={quickUpdate}>
                  <input type="hidden" name="id" value={nomination.id} />
                  <input type="hidden" name="district_key" value={districtKey} />
                  <input type="hidden" name="status_override" value="force_closed" />
                  <button type="submit" className="text-neutral-500 underline">
                    Force Closed
                  </button>
                </form>
                <form action={deleteNomination}>
                  <input type="hidden" name="id" value={nomination.id} />
                  <input type="hidden" name="district_key" value={districtKey} />
                  <button type="submit" className="text-red-700 underline">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
