import { createServerSupabase } from "@/lib/supabase/server";
import ImageUploadField from "@/components/shared/ImageUploadField";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DISTRICT_OPTIONS } from "@/lib/districts";

export default async function EditAdPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("ads")
    .select("id, district_key, placement, description, start_date, end_date, active, image_url, link_url, html, weight")
    .eq("id", params.id)
    .maybeSingle();

  if (!data) {
    return <p>Ad not found.</p>;
  }

  const ad = data;

  async function updateAd(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const nextDistrictKey = String(formData.get("district_key") || ad.district_key);
    await supabase
      .from("ads")
      .update({
        district_key: nextDistrictKey,
        placement: String(formData.get("placement")),
        description: String(formData.get("description") || ""),
        start_date: String(formData.get("start_date")),
        end_date: String(formData.get("end_date")),
        active: formData.get("active") === "on",
        image_url: String(formData.get("image_url") || ""),
        link_url: String(formData.get("link_url") || ""),
        html: String(formData.get("html") || ""),
        weight: Number(formData.get("weight") || 1),
      })
      .eq("id", params.id);
    revalidatePath("/", "layout");
    revalidatePath("/cms/ads");
    redirect(`/cms/ads?district=${encodeURIComponent(nextDistrictKey)}`);
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Edit Ad</h1>
        <p className="text-sm text-neutral-500">Update ad content and dates.</p>
      </header>
      <form action={updateAd} className="grid gap-3 rounded border border-neutral-200 bg-white p-6 md:grid-cols-2">
        <select name="district_key" defaultValue={ad.district_key} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {DISTRICT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          name="description"
          placeholder="Description (internal only)"
          defaultValue={ad.description || ""}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <select name="placement" defaultValue={ad.placement} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="allsite">All-site</option>
          <option value="homepage">Homepage</option>
          <option value="story">Story</option>
        </select>
        <input name="weight" type="number" min="1" defaultValue={ad.weight} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="start_date" type="date" defaultValue={ad.start_date} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="end_date" type="date" defaultValue={ad.end_date} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <div className="md:col-span-2">
          <ImageUploadField name="image_url" label="Ad Image" folder="krtr/ads" initialUrl={ad.image_url || ""} />
        </div>
        <input name="link_url" placeholder="Link URL" defaultValue={ad.link_url || ""} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <textarea name="html" placeholder="Optional HTML" defaultValue={ad.html || ""} className="min-h-[100px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={ad.active} />
          Active
        </label>
        <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white md:col-span-2">
          Save Changes
        </button>
      </form>
    </div>
  );
}
