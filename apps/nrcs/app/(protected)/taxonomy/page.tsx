import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { createNrcsServiceClient } from "@/lib/server";
import { normalizeSlug } from "@/lib/stories";

const TAG_TYPES = ["place", "organization", "person", "topic", "event_series", "other"] as const;

function cleanText(value: FormDataEntryValue | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

async function createCategory(formData: FormData) {
  "use server";
  await requireNrcsStaff("editor");

  const districtKey = cleanText(formData.get("district_key")).toLowerCase();
  const name = cleanText(formData.get("name"));
  const slug = normalizeSlug(cleanText(formData.get("slug")) || name);

  if (!districtKey || !name || !slug) redirect(`/taxonomy?district=${districtKey}&error=Category name is required`);

  const service = createNrcsServiceClient();
  const { error } = await service.from("nrcs_categories").insert({
    district_key: districtKey,
    name,
    slug,
    enabled: formData.get("enabled") === "on",
  });

  if (error) redirect(`/taxonomy?district=${districtKey}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/taxonomy");
  redirect(`/taxonomy?district=${districtKey}&success=category`);
}

async function updateCategory(formData: FormData) {
  "use server";
  await requireNrcsStaff("editor");

  const id = cleanText(formData.get("id"));
  const districtKey = cleanText(formData.get("district_key")).toLowerCase();
  const name = cleanText(formData.get("name"));
  const slug = normalizeSlug(cleanText(formData.get("slug")) || name);
  if (!id || !name || !slug) redirect(`/taxonomy?district=${districtKey}&error=Category name is required`);

  const service = createNrcsServiceClient();
  const { error } = await service
    .from("nrcs_categories")
    .update({ name, slug, enabled: formData.get("enabled") === "on" })
    .eq("id", id);

  if (error) redirect(`/taxonomy?district=${districtKey}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/taxonomy");
  redirect(`/taxonomy?district=${districtKey}&success=category`);
}

async function createTag(formData: FormData) {
  "use server";
  await requireNrcsStaff("editor");

  const districtKey = cleanText(formData.get("district_key")).toLowerCase();
  const name = cleanText(formData.get("name"));
  const slug = normalizeSlug(cleanText(formData.get("slug")) || name);
  const tagTypeInput = cleanText(formData.get("tag_type"));
  const tagType = TAG_TYPES.includes(tagTypeInput as never) ? tagTypeInput : "other";

  if (!name || !slug) redirect(`/taxonomy?district=${districtKey}&error=Tag name is required`);

  const service = createNrcsServiceClient();
  const { error } = await service.from("nrcs_tags").insert({ name, slug, tag_type: tagType });
  if (error) redirect(`/taxonomy?district=${districtKey}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/taxonomy");
  redirect(`/taxonomy?district=${districtKey}&success=tag`);
}

async function updateTag(formData: FormData) {
  "use server";
  await requireNrcsStaff("editor");

  const districtKey = cleanText(formData.get("district_key")).toLowerCase();
  const id = cleanText(formData.get("id"));
  const name = cleanText(formData.get("name"));
  const slug = normalizeSlug(cleanText(formData.get("slug")) || name);
  const tagTypeInput = cleanText(formData.get("tag_type"));
  const tagType = TAG_TYPES.includes(tagTypeInput as never) ? tagTypeInput : "other";

  if (!id || !name || !slug) redirect(`/taxonomy?district=${districtKey}&error=Tag name is required`);

  const service = createNrcsServiceClient();
  const { error } = await service.from("nrcs_tags").update({ name, slug, tag_type: tagType }).eq("id", id);
  if (error) redirect(`/taxonomy?district=${districtKey}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/taxonomy");
  redirect(`/taxonomy?district=${districtKey}&success=tag`);
}

async function addAlias(formData: FormData) {
  "use server";
  await requireNrcsStaff("editor");

  const districtKey = cleanText(formData.get("district_key")).toLowerCase();
  const tagId = cleanText(formData.get("tag_id"));
  const alias = cleanText(formData.get("alias"));
  if (!tagId || !alias) redirect(`/taxonomy?district=${districtKey}&error=Alias is required`);

  const service = createNrcsServiceClient();
  const { error } = await service.from("nrcs_tag_aliases").insert({ tag_id: tagId, alias });
  if (error) redirect(`/taxonomy?district=${districtKey}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/taxonomy");
  redirect(`/taxonomy?district=${districtKey}&success=alias`);
}

export default async function TaxonomyPage({
  searchParams,
}: {
  searchParams?: Promise<{ district?: string; error?: string; success?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) || {};
  await requireNrcsStaff("editor");
  const { activeDistrict, allowedDistricts } = await getNrcsDistrictContext();
  const districtKey =
    resolvedSearchParams.district && allowedDistricts.some((district) => district.district_key === resolvedSearchParams.district)
      ? resolvedSearchParams.district
      : activeDistrict?.district_key || "dlpc";

  const service = createNrcsServiceClient();
  const [{ data: categories, error: categoryError }, { data: tags, error: tagError }] = await Promise.all([
    service.from("nrcs_categories").select("id, district_key, name, slug, enabled").eq("district_key", districtKey).order("name"),
    service.from("nrcs_tags").select("id, name, slug, tag_type, nrcs_tag_aliases(id, alias)").order("name"),
  ]);

  if (categoryError) throw new Error(`Unable to load categories: ${categoryError.message}`);
  if (tagError) throw new Error(`Unable to load tags: ${tagError.message}`);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Taxonomy</h1>
        <p className="text-sm text-neutral-500">Manage district categories and canonical reusable tags.</p>
      </header>

      {resolvedSearchParams.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{resolvedSearchParams.error}</p>}
      {resolvedSearchParams.success && <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">Saved.</p>}

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <select name="district" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {allowedDistricts.map((district) => (
            <option key={district.district_key} value={district.district_key}>{district.display_name}</option>
          ))}
        </select>
        <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Switch</button>
      </form>

      <section className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Categories</h2>
        <form action={createCategory} className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
          <input type="hidden" name="district_key" value={districtKey} />
          <input name="name" placeholder="Category name" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <input name="slug" placeholder="Slug, optional" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <label className="inline-flex items-center gap-2 rounded border border-neutral-200 px-3 py-2 text-sm">
            <input name="enabled" type="checkbox" defaultChecked /> Enabled
          </label>
          <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Create</button>
        </form>
        <div className="grid gap-2">
          {(categories || []).map((category) => (
            <form key={category.id} action={updateCategory} className="grid gap-3 border-t border-neutral-100 pt-3 md:grid-cols-[1fr_1fr_auto_auto]">
              <input type="hidden" name="id" value={category.id} />
              <input type="hidden" name="district_key" value={districtKey} />
              <input name="name" defaultValue={category.name} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
              <input name="slug" defaultValue={category.slug} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
              <label className="inline-flex items-center gap-2 px-3 py-2 text-sm">
                <input name="enabled" type="checkbox" defaultChecked={category.enabled} /> Enabled
              </label>
              <button className="text-left text-sm font-semibold underline">Save</button>
            </form>
          ))}
        </div>
      </section>

      <section className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Canonical Tags</h2>
        <form action={createTag} className="grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]">
          <input type="hidden" name="district_key" value={districtKey} />
          <input name="name" placeholder="Tag name" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <input name="slug" placeholder="Slug, optional" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <select name="tag_type" defaultValue="other" className="rounded border border-neutral-300 px-3 py-2 text-sm">
            {TAG_TYPES.map((type) => <option key={type} value={type}>{type.replace("_", " ")}</option>)}
          </select>
          <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Create</button>
        </form>
        <div className="grid gap-4">
          {(tags || []).map((tag) => (
            <div key={tag.id} className="grid gap-3 border-t border-neutral-100 pt-3">
              <form action={updateTag} className="grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]">
                <input type="hidden" name="district_key" value={districtKey} />
                <input type="hidden" name="id" value={tag.id} />
                <input name="name" defaultValue={tag.name} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
                <input name="slug" defaultValue={tag.slug} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
                <select name="tag_type" defaultValue={tag.tag_type} className="rounded border border-neutral-300 px-3 py-2 text-sm">
                  {TAG_TYPES.map((type) => <option key={type} value={type}>{type.replace("_", " ")}</option>)}
                </select>
                <button className="text-left text-sm font-semibold underline">Save</button>
              </form>
              <div className="text-xs text-neutral-500">
                Aliases: {(tag.nrcs_tag_aliases || []).map((alias: { alias: string }) => alias.alias).join(", ") || "none"}
              </div>
              <form action={addAlias} className="flex flex-wrap gap-2">
                <input type="hidden" name="district_key" value={districtKey} />
                <input type="hidden" name="tag_id" value={tag.id} />
                <input name="alias" placeholder="Add alias" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
                <button className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">Add Alias</button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
