import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import ImageUploadField from "@/components/shared/ImageUploadField";

export default async function EditLogoPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const { data: logo } = await supabase
    .from("logos")
    .select("id, description, image_url, active, start_date, end_date")
    .eq("id", params.id)
    .maybeSingle();

  if (!logo) {
    return <p>Logo not found.</p>;
  }

  async function updateLogo(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    await service
      .from("logos")
      .update({
        description: String(formData.get("description") || ""),
        image_url: String(formData.get("image_url") || ""),
        start_date: String(formData.get("start_date")),
        end_date: String(formData.get("end_date")),
        active: formData.get("active") === "on",
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
          defaultValue={logo.start_date}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="end_date"
          type="date"
          defaultValue={logo.end_date}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
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
