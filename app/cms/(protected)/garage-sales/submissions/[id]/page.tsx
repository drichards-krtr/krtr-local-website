import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import CloudinaryMediaLibraryField from "@/components/cms/CloudinaryMediaLibraryField";
import { createServerSupabase } from "@/lib/supabase/server";
import { DISTRICT_OPTIONS, parseDistrictKey } from "@/lib/districts";

export default async function EditGarageSaleSubmissionPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { district?: string; status?: string };
}) {
  const supabase = createServerSupabase();
  const districtKey = parseDistrictKey(searchParams?.district) || "dlpc";
  const statusFilter = searchParams?.status || "draft";

  const [{ data: submission }, { data: sessions }] = await Promise.all([
    supabase
      .from("garage_sale_submissions")
      .select(
        "id, session_id, district_key, address, date_times, items, image_url, submitter_name, submitter_phone, submitter_email, status"
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("garage_sale_sessions")
      .select("id, name, district_key")
      .eq("district_key", districtKey)
      .order("open_date", { ascending: false }),
  ]);

  if (!submission) {
    return <p>Garage sale submission not found.</p>;
  }

  async function updateSubmission(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const result = await supabase
      .from("garage_sale_submissions")
      .update({
        district_key: nextDistrictKey,
        session_id: String(formData.get("session_id") || ""),
        address: String(formData.get("address") || "").trim(),
        date_times: String(formData.get("date_times") || "").trim(),
        items: String(formData.get("items") || "").trim(),
        image_url: String(formData.get("image_url") || "").trim() || null,
        submitter_name: String(formData.get("submitter_name") || "").trim(),
        submitter_phone: String(formData.get("submitter_phone") || "").trim(),
        submitter_email: String(formData.get("submitter_email") || "").trim(),
        status: String(formData.get("status") || "draft"),
      })
      .eq("id", params.id);

    if (result.error) {
      throw new Error(`Unable to update garage sale submission: ${result.error.message}`);
    }

    revalidatePath("/garage-sales");
    revalidatePath("/cms/garage-sales");
    redirect(`/cms/garage-sales?district=${nextDistrictKey}&status=${statusFilter}`);
  }

  return (
    <div className="grid gap-6">
      <header>
        <a href={`/cms/garage-sales?district=${districtKey}&status=${statusFilter}`} className="text-sm underline">
          Back to Garage Sales
        </a>
        <h1 className="mt-2 text-2xl font-semibold">Review Garage Sale Submission</h1>
        <p className="text-sm text-neutral-500">Edit listing details and publish when ready.</p>
      </header>

      <form action={updateSubmission} className="grid gap-3 rounded border border-neutral-200 bg-white p-6 md:grid-cols-2">
        <select
          name="district_key"
          defaultValue={submission.district_key}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {DISTRICT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          name="session_id"
          defaultValue={submission.session_id}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {(sessions || []).map((session) => (
            <option key={session.id} value={session.id}>
              {session.name}
            </option>
          ))}
        </select>
        <input
          name="address"
          defaultValue={submission.address}
          required
          className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
        />
        <textarea
          name="date_times"
          defaultValue={submission.date_times}
          required
          className="min-h-[100px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
        />
        <textarea
          name="items"
          defaultValue={submission.items}
          required
          className="min-h-[120px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
        />
        <select
          name="status"
          defaultValue={submission.status}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <div />
        <div className="rounded border border-neutral-200 bg-neutral-50 p-3 md:col-span-2">
          <h2 className="text-sm font-semibold">Submitter Contact</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <input
              name="submitter_name"
              defaultValue={submission.submitter_name}
              required
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="submitter_phone"
              defaultValue={submission.submitter_phone}
              required
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="submitter_email"
              type="email"
              defaultValue={submission.submitter_email}
              required
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="md:col-span-2">
          <CloudinaryMediaLibraryField
            name="image_url"
            label="Optional Image"
            folder="krtr/garage-sales"
            initialUrl={submission.image_url || ""}
          />
        </div>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white md:col-span-2"
        >
          Save Submission
        </button>
      </form>
    </div>
  );
}
