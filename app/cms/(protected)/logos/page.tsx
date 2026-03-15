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

export default async function LogosPage() {
  const supabase = createServerSupabase();
  const { data: logos } = await supabase
    .from("logos")
    .select("id, description, image_url, active, is_default, start_date, end_date")
    .order("is_default", { ascending: false })
    .order("start_date", { ascending: true })
    .order("end_date", { ascending: true });

  async function addLogo(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const { isDefault, startDate, endDate } = normalizeLogoDates(formData);
    if (isDefault) {
      await service.from("logos").update({ is_default: false }).eq("is_default", true);
    }
    await service.from("logos").insert({
      description: String(formData.get("description") || ""),
      image_url: String(formData.get("image_url") || ""),
      start_date: startDate,
      end_date: endDate,
      active: formData.get("active") === "on",
      is_default: isDefault,
    });
    revalidatePath("/", "layout");
    revalidatePath("/cms/logos");
    redirect("/cms/logos");
  }

  async function toggleLogo(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id"));
    const next = formData.get("next") === "true";
    await service.from("logos").update({ active: next }).eq("id", id);
    revalidatePath("/", "layout");
    revalidatePath("/cms/logos");
    redirect("/cms/logos");
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Logos</h1>
        <p className="text-sm text-neutral-500">
          Manage scheduled header logos with date windows.
        </p>
        <p className="mt-2 text-sm text-neutral-600">
          Recommended logo size: 480w x 120h (or larger at the same 4:1 ratio).
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          Mark one logo as the default fallback to show whenever no dated logo is active.
        </p>
      </header>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Add Logo</h2>
        <form action={addLogo} className="grid gap-3 md:grid-cols-2">
          <input
            name="description"
            placeholder="Description (internal only)"
            className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
          />
          <div className="md:col-span-2">
            <ImageUploadField name="image_url" label="Logo Image" folder="krtr/logos" />
          </div>
          <input
            name="start_date"
            type="date"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="end_date"
            type="date"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-neutral-500 md:col-span-2">
            Dates are for scheduled logos. Leave them blank only when marking a logo as the default
            fallback.
          </p>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" name="is_default" />
            Use as default fallback logo
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked />
            Active
          </label>
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white md:col-span-2"
          >
            Save Logo
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1.5fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Description</div>
          <div>Dates</div>
          <div>Status</div>
          <div>Preview</div>
          <div>Actions</div>
        </div>
        {(logos || []).map((logo) => (
          <div
            key={logo.id}
            className="grid grid-cols-[1.5fr_1fr_1fr_1.5fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
          >
            <div className="truncate">
              {logo.description || "-"}
              {logo.is_default ? " (Default)" : ""}
            </div>
            <div>
              {logo.is_default ? "Fallback" : `${logo.start_date} - ${logo.end_date}`}
            </div>
            <div>{logo.active ? "Active" : "Inactive"}</div>
            <div className="truncate">{logo.image_url || "-"}</div>
            <div className="flex gap-3">
              <a href={`/cms/logos/${logo.id}`} className="text-sm underline">
                Edit
              </a>
              <form action={toggleLogo}>
                <input type="hidden" name="id" value={logo.id} />
                <input
                  type="hidden"
                  name="next"
                  value={(!logo.active).toString()}
                />
                <button type="submit" className="text-sm underline">
                  {logo.active ? "Deactivate" : "Activate"}
                </button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
