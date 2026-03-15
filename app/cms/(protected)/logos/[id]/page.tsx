import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import ImageUploadField from "@/components/shared/ImageUploadField";

function normalizeLogoDates(formData: FormData) {
  const isDefault = formData.get("is_default") === "on";
  const startDate = String(formData.get("start_date") || "");
  const endDate = String(formData.get("end_date") || "");

  return {
    isDefault,
    startDate: startDate || (isDefault ? "1900-01-01" : ""),
    endDate: endDate || (isDefault ? "2999-12-31" : ""),
  };
}

export default async function EditLogoPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const { data: logo } = await supabase
    .from("logos")
    .select("id, description, image_url, active, is_default, start_date, end_date")
    .eq("id", params.id)
    .maybeSingle();

  if (!logo) {
    return <p>Logo not found.</p>;
  }

  async function updateLogo(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const { isDefault, startDate, endDate } = normalizeLogoDates(formData);
    if (isDefault) {
      await service
        .from("logos")
        .update({ is_default: false })
        .eq("is_default", true)
        .neq("id", params.id);
    }
    await service
      .from("logos")
      .update({
        description: String(formData.get("description") || ""),
        image_url: String(formData.get("image_url") || ""),
        start_date: startDate,
        end_date: endDate,
        active: formData.get("active") === "on",
        is_default: isDefault,
      })
      .eq("id", params.id);
    revalidatePath("/", "layout");
    revalidatePath("/cms/logos");
    revalidatePath(`/cms/logos/${params.id}`);
    redirect("/cms/logos");
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Edit Logo</h1>
        <p className="text-sm text-neutral-500">Update logo image and schedule.</p>
      </header>
      <form
        action={updateLogo}
        className="grid gap-3 rounded border border-neutral-200 bg-white p-6 md:grid-cols-2"
      >
        <input
          name="description"
          placeholder="Description (internal only)"
          defaultValue={logo.description || ""}
          className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
        />
        <div className="md:col-span-2">
          <ImageUploadField
            name="image_url"
            label="Logo Image"
            folder="krtr/logos"
            initialUrl={logo.image_url || ""}
          />
        </div>
        <input
          name="start_date"
          type="date"
          defaultValue={logo.is_default ? "" : logo.start_date}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="end_date"
          type="date"
          defaultValue={logo.is_default ? "" : logo.end_date}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-neutral-500 md:col-span-2">
          Dates are for scheduled logos. Leave them blank only when marking a logo as the default
          fallback.
        </p>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" name="is_default" defaultChecked={logo.is_default} />
          Use as default fallback logo
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={logo.active} />
          Active
        </label>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white md:col-span-2"
        >
          Save Changes
        </button>
      </form>
    </div>
  );
}
