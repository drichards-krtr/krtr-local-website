import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";

type DistrictRow = {
  id: string;
  district_key: string;
  subdomain: string;
  display_name: string;
  enabled: boolean;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  created_at: string;
};

function cleanText(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function normalizeKey(value: FormDataEntryValue | null) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSubdomain(value: FormDataEntryValue | null) {
  return String(value || "").trim().toLowerCase();
}

function normalizeEmail(value: FormDataEntryValue | null) {
  const text = String(value || "").trim().toLowerCase();
  return text.length > 0 ? text : null;
}

function revalidateDistrictConfiguration() {
  revalidatePath("/cms/districts");
  revalidatePath("/", "layout");
}

async function createDistrict(formData: FormData) {
  "use server";

  const districtKey = normalizeKey(formData.get("district_key"));
  const subdomain = normalizeSubdomain(formData.get("subdomain"));
  const displayName = String(formData.get("display_name") || "").trim();

  if (!districtKey || !subdomain || !displayName) {
    redirect("/cms/districts?error=District key, subdomain, and display name are required");
  }

  const service = createServiceClient();
  const { error } = await service.from("districts").insert({
    district_key: districtKey,
    subdomain,
    display_name: displayName,
    enabled: formData.get("enabled") === "on",
    primary_contact_name: cleanText(formData.get("primary_contact_name")),
    primary_contact_email: normalizeEmail(formData.get("primary_contact_email")),
    primary_contact_phone: cleanText(formData.get("primary_contact_phone")),
  });

  if (error) {
    redirect(`/cms/districts?error=${encodeURIComponent(error.message)}`);
  }

  revalidateDistrictConfiguration();
  redirect("/cms/districts?success=created");
}

async function updateDistrict(formData: FormData) {
  "use server";

  const id = String(formData.get("id") || "");
  const subdomain = normalizeSubdomain(formData.get("subdomain"));
  const displayName = String(formData.get("display_name") || "").trim();

  if (!id || !subdomain || !displayName) {
    redirect("/cms/districts?error=Subdomain and display name are required");
  }

  const service = createServiceClient();
  const { error } = await service
    .from("districts")
    .update({
      subdomain,
      display_name: displayName,
      enabled: formData.get("enabled") === "on",
      primary_contact_name: cleanText(formData.get("primary_contact_name")),
      primary_contact_email: normalizeEmail(formData.get("primary_contact_email")),
      primary_contact_phone: cleanText(formData.get("primary_contact_phone")),
    })
    .eq("id", id);

  if (error) {
    redirect(`/cms/districts?error=${encodeURIComponent(error.message)}`);
  }

  revalidateDistrictConfiguration();
  redirect("/cms/districts?success=updated");
}

export default async function DistrictConfigurationPage({
  searchParams,
}: {
  searchParams?: { error?: string; success?: string };
}) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("districts")
    .select(
      "id, district_key, subdomain, display_name, enabled, primary_contact_name, primary_contact_email, primary_contact_phone, created_at"
    )
    .order("display_name", { ascending: true });

  if (error) {
    throw new Error(`Unable to load districts: ${error.message}`);
  }

  const districts = (data || []) as DistrictRow[];

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">District Configuration</h1>
        <p className="text-sm text-neutral-500">
          Create districts, manage launch status, and maintain district contact details.
        </p>
      </header>

      {searchParams?.error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}
      {searchParams?.success && (
        <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Saved.
        </p>
      )}

      <section className="rounded border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Create District</h2>
        <form action={createDistrict} className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">District Key</span>
            <input
              name="district_key"
              placeholder="dlpc"
              required
              pattern="[a-z0-9][a-z0-9-]*"
              className="rounded border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Subdomain</span>
            <input
              name="subdomain"
              placeholder="dlpc.krtrlocal.tv"
              required
              className="rounded border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Display Name</span>
            <input
              name="display_name"
              placeholder="Dysart-La Porte City"
              required
              className="rounded border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Primary Contact Name</span>
            <input name="primary_contact_name" className="rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Primary Contact Email</span>
            <input name="primary_contact_email" type="email" className="rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Primary Contact Phone</span>
            <input name="primary_contact_phone" className="rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input name="enabled" type="checkbox" />
            Enabled
          </label>
          <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white md:col-span-3">
            Create District
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[120px_1fr_1fr_100px] gap-3 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Key</div>
          <div>District</div>
          <div>Primary Contact</div>
          <div>Status</div>
        </div>
        {districts.map((district) => (
          <form
            key={district.id}
            action={updateDistrict}
            className="grid gap-3 border-b border-neutral-100 px-4 py-4 text-sm lg:grid-cols-[120px_1fr_1fr_100px]"
          >
            <input type="hidden" name="id" value={district.id} />
            <div>
              <div className="font-medium">{district.district_key}</div>
              <div className="text-xs text-neutral-500">UUID stored</div>
            </div>
            <div className="grid gap-2">
              <input
                name="display_name"
                defaultValue={district.display_name}
                required
                className="rounded border border-neutral-300 px-3 py-2"
              />
              <input
                name="subdomain"
                defaultValue={district.subdomain}
                required
                className="rounded border border-neutral-300 px-3 py-2"
              />
            </div>
            <div className="grid gap-2">
              <input
                name="primary_contact_name"
                defaultValue={district.primary_contact_name || ""}
                placeholder="Name"
                className="rounded border border-neutral-300 px-3 py-2"
              />
              <input
                name="primary_contact_email"
                type="email"
                defaultValue={district.primary_contact_email || ""}
                placeholder="Email"
                className="rounded border border-neutral-300 px-3 py-2"
              />
              <input
                name="primary_contact_phone"
                defaultValue={district.primary_contact_phone || ""}
                placeholder="Phone"
                className="rounded border border-neutral-300 px-3 py-2"
              />
            </div>
            <div className="grid content-start gap-3">
              <label className="inline-flex items-center gap-2">
                <input name="enabled" type="checkbox" defaultChecked={district.enabled} />
                Enabled
              </label>
              <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">
                Save
              </button>
            </div>
          </form>
        ))}
      </section>
    </div>
  );
}
