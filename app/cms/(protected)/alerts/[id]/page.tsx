import { createServerSupabase } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DISTRICT_OPTIONS } from "@/lib/districts";

export default async function EditAlertPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("alerts")
    .select("id, district_key, message, link_url, active, start_at, end_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!data) {
    return <p>Alert not found.</p>;
  }

  const alert = data;

  async function updateAlert(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const nextDistrictKey = String(formData.get("district_key") || alert.district_key);
    await supabase
      .from("alerts")
      .update({
        district_key: nextDistrictKey,
        message: String(formData.get("message")),
        link_url: String(formData.get("link_url") || ""),
        start_at: String(formData.get("start_at") || ""),
        end_at: String(formData.get("end_at") || ""),
        active: formData.get("active") === "on",
      })
      .eq("id", params.id);
    revalidatePath("/", "layout");
    revalidatePath("/cms/alerts");
    redirect(`/cms/alerts?district=${encodeURIComponent(nextDistrictKey)}`);
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Edit Alert</h1>
        <p className="text-sm text-neutral-500">Update breaking alert text.</p>
      </header>
      <form action={updateAlert} className="grid gap-3 rounded border border-neutral-200 bg-white p-6">
        <select name="district_key" defaultValue={alert.district_key} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {DISTRICT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <textarea name="message" defaultValue={alert.message} className="min-h-[80px] rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="link_url" defaultValue={alert.link_url || ""} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <div className="grid gap-3 md:grid-cols-2">
          <input name="start_at" type="datetime-local" defaultValue={alert.start_at?.slice(0, 16) || ""} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <input name="end_at" type="datetime-local" defaultValue={alert.end_at?.slice(0, 16) || ""} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={alert.active} />
          Active
        </label>
        <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">
          Save Changes
        </button>
      </form>
    </div>
  );
}
