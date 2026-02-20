import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import ImageUploadField from "@/components/shared/ImageUploadField";

export default async function LogosPage() {
  const supabase = createServerSupabase();
  const { data: logos } = await supabase
    .from("logos")
    .select("id, description, image_url, active, start_date, end_date")
    .order("created_at", { ascending: false });

  async function addLogo(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    await service.from("logos").insert({
      description: String(formData.get("description") || ""),
      image_url: String(formData.get("image_url") || ""),
      start_date: String(formData.get("start_date")),
      end_date: String(formData.get("end_date")),
      active: formData.get("active") === "on",
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
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="end_date"
            type="date"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
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
            <div className="truncate">{logo.description || "-"}</div>
            <div>
              {logo.start_date} - {logo.end_date}
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
