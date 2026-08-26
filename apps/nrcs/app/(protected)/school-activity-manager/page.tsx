import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import {
  EVENT_CLASSIFICATION_KINDS,
  getClassificationKindLabel,
  sortClassificationTerms,
  type EventClassificationKind,
  type EventClassificationTerm,
} from "@/lib/eventClassifications";
import { createNrcsServiceClient } from "@/lib/server";

function cleanName(value: FormDataEntryValue | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getKind(value: FormDataEntryValue | null): EventClassificationKind {
  const kind = String(value || "");
  return EVENT_CLASSIFICATION_KINDS.includes(kind as EventClassificationKind)
    ? (kind as EventClassificationKind)
    : "sport";
}

async function createTerm(formData: FormData) {
  "use server";
  await requireNrcsStaff("editor");

  const districtKey = String(formData.get("district_key") || "").trim().toLowerCase();
  const kind = getKind(formData.get("kind"));
  const name = cleanName(formData.get("name"));

  if (!districtKey || !name) {
    redirect("/school-activity-manager?error=District and name are required");
  }

  const service = createNrcsServiceClient();
  const { error } = await service.from("nrcs_event_classification_terms").insert({
    district_key: districtKey,
    kind,
    name,
    enabled: formData.get("enabled") === "on",
  });

  if (error) {
    redirect(`/school-activity-manager?district=${districtKey}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/school-activity-manager");
  redirect(`/school-activity-manager?district=${districtKey}&success=created`);
}

async function updateTerm(formData: FormData) {
  "use server";
  await requireNrcsStaff("editor");

  const id = String(formData.get("id") || "");
  const districtKey = String(formData.get("district_key") || "").trim().toLowerCase();
  const name = cleanName(formData.get("name"));

  if (!id || !name) {
    redirect(`/school-activity-manager?district=${districtKey}&error=Name is required`);
  }

  const service = createNrcsServiceClient();
  const { error } = await service
    .from("nrcs_event_classification_terms")
    .update({
      name,
      enabled: formData.get("enabled") === "on",
    })
    .eq("id", id);

  if (error) {
    redirect(`/school-activity-manager?district=${districtKey}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/school-activity-manager");
  redirect(`/school-activity-manager?district=${districtKey}&success=updated`);
}

export default async function SchoolActivityManagerPage({
  searchParams,
}: {
  searchParams?: Promise<{ district?: string; error?: string; success?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  await requireNrcsStaff("editor");
  const { activeDistrict, allowedDistricts } = await getNrcsDistrictContext();
  const districtKey =
    resolvedSearchParams?.district && allowedDistricts.some((district) => district.district_key === resolvedSearchParams.district)
      ? resolvedSearchParams.district
      : activeDistrict?.district_key || "dlpc";

  const service = createNrcsServiceClient();
  const { data, error } = await service
    .from("nrcs_event_classification_terms")
    .select("id, district_key, kind, name, enabled")
    .eq("district_key", districtKey);

  if (error) {
    throw new Error(`Unable to load school activity terms: ${error.message}`);
  }

  const terms = sortClassificationTerms((data || []) as EventClassificationTerm[]);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">School Activity Manager</h1>
        <p className="text-sm text-neutral-500">Manage district sports, extra-curriculars, and other event types.</p>
      </header>

      {resolvedSearchParams?.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{resolvedSearchParams.error}</p>}
      {resolvedSearchParams?.success && <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">Saved.</p>}

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <select name="district" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {allowedDistricts.map((district) => (
            <option key={district.district_key} value={district.district_key}>
              {district.display_name}
            </option>
          ))}
        </select>
        <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Switch</button>
      </form>

      <section className="rounded border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Create Term</h2>
        <form action={createTerm} className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto_auto]">
          <input type="hidden" name="district_key" value={districtKey} />
          <select name="kind" className="rounded border border-neutral-300 px-3 py-2 text-sm">
            {EVENT_CLASSIFICATION_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {getClassificationKindLabel(kind)}
              </option>
            ))}
          </select>
          <input name="name" placeholder="Name" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <label className="inline-flex items-center gap-2 rounded border border-neutral-200 px-3 py-2 text-sm">
            <input name="enabled" type="checkbox" defaultChecked />
            Enabled
          </label>
          <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Create</button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[1fr_180px_120px_100px] gap-3 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Name</div>
          <div>Type</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {terms.map((term) => (
          <form key={term.id} action={updateTerm} className="grid grid-cols-[1fr_180px_120px_100px] gap-3 border-b border-neutral-100 px-4 py-3 text-sm">
            <input type="hidden" name="id" value={term.id} />
            <input type="hidden" name="district_key" value={districtKey} />
            <input name="name" defaultValue={term.name} required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
            <div className="py-2">{getClassificationKindLabel(term.kind)}</div>
            <label className="inline-flex items-center gap-2">
              <input name="enabled" type="checkbox" defaultChecked={term.enabled} />
              Enabled
            </label>
            <button className="underline">Save</button>
          </form>
        ))}
      </section>
    </div>
  );
}
