import Link from "next/link";
import { notFound } from "next/navigation";
import RichTextEditor from "@/components/RichTextEditor";
import { requireNrcsStaff } from "@/lib/auth";
import { addTemplateItem, updateTemplateItem, deleteTemplateItem, moveTemplateItem, updateProgramTemplate, RUNDOWN_ITEM_TYPES, scriptTextFromHtml } from "@/lib/programs";
import { createNrcsServerClient } from "@/lib/server";

const SEGMENT_KINDS = ["Intro", "News", "Events", "Weather", "Sports Scores", "Upcoming Sports", "Break", "Outro"];
function itemTypeLabel(value: string) {
  return value === "segment" ? "Segment Item" : value === "script" ? "Script Item" : "Production Note";
}
const fieldClass = "rounded border border-neutral-300 px-3 py-2 text-sm";
function ItemFields({ item }: { item?: { item_type: string; title: string; segment_kind: string | null; body_html: string | null } }) {
  return <>
    <div className="grid gap-3 md:grid-cols-3">
      <label className="grid gap-1 text-sm">Type<select name="item_type" defaultValue={item?.item_type || "script"} className={fieldClass}>{RUNDOWN_ITEM_TYPES.filter(type => type !== "story").map(type => <option key={type} value={type}>{itemTypeLabel(type)}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Title<input name="title" defaultValue={item?.title || ""} required className={fieldClass} /></label>
      <label className="grid gap-1 text-sm">Segment Kind<select name="segment_kind" defaultValue={item?.segment_kind || ""} className={fieldClass}><option value="">None</option>{SEGMENT_KINDS.map(kind => <option key={kind}>{kind}</option>)}</select></label>
    </div>
    <div className="grid gap-1 text-sm"><span>Body</span><RichTextEditor name="body_html" initialHtml={item?.body_html || ""} /></div>
  </>;
}
export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string; mode?: string }> }) {
  await requireNrcsStaff("editor");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createNrcsServerClient();
  const [{ data: template, error }, { data: rows, error: itemsError }] = await Promise.all([
    supabase.from("nrcs_program_templates").select("id, program_id, name, enabled, nrcs_programs(name, district_key, enabled)").eq("id", id).maybeSingle(),
    supabase.from("nrcs_program_template_items").select("id, item_type, title, body_html, segment_kind, sort_order").eq("template_id", id).order("sort_order").order("id"),
  ]);
  if (error || itemsError) throw new Error(error?.message || itemsError?.message);
  if (!template) notFound();
  const program = Array.isArray(template.nrcs_programs) ? template.nrcs_programs[0] : template.nrcs_programs;
  const items = rows || [];
  const scriptMode = query.mode === "script";
  return <div className="grid gap-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{template.name}</h1><p className="text-sm text-neutral-500">{program?.name} - Template</p></div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/programs?district=${program?.district_key}`} className={fieldClass}>Back to Programs</Link>
        <Link href={`/templates/${id}${scriptMode ? "" : "?mode=script"}`} className={fieldClass}>{scriptMode ? "Edit Template" : "Script View"}</Link>
        {template.enabled && program?.enabled && <Link href={`/editions/new?template=${id}`} className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Create Rundown from Template</Link>}
      </div>
    </header>
    {query.error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error}</p>}
    {query.success && <p role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">Template update saved.</p>}
    {scriptMode ? <section className="grid gap-5">
      <h2 className="text-lg font-semibold">Continuous Script</h2>
      {items.filter(item => item.item_type !== "production_note").map(item => <article key={item.id} className="border-b border-neutral-200 pb-5"><h3 className="font-semibold">{item.title}</h3><div className="mt-2 whitespace-pre-wrap leading-7">{scriptTextFromHtml(item.body_html) || "-"}</div></article>)}
      {!items.some(item => item.item_type !== "production_note") && <p className="text-sm text-neutral-500">No script content exists yet.</p>}
    </section> : <>
      <section className="grid gap-4 border-b border-neutral-200 pb-6">
        <h2 className="text-lg font-semibold">Template Settings</h2>
        <form action={updateProgramTemplate} className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input type="hidden" name="template_id" value={id} />
          <label className="grid gap-1 text-sm">Name<input name="name" defaultValue={template.name} required className={fieldClass} /></label>
          <label className="flex items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={template.enabled} />Enabled</label>
          <button className="self-end rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Save Template</button>
        </form>
      </section>
      <section className="grid gap-4 border-b border-neutral-200 pb-6">
        <h2 className="text-lg font-semibold">Add Segment, Script, or Note</h2>
        <form action={addTemplateItem} className="grid gap-3"><input type="hidden" name="template_id" value={id} /><ItemFields /><button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Add Item</button></form>
      </section>
      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">Template Items</h2>
        {items.map((item, index) => <article key={item.id} className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-semibold uppercase text-neutral-500">{index + 1}. {itemTypeLabel(item.item_type)}</div><h3 className="text-lg font-semibold">{item.title}</h3></div>
            <div className="flex gap-2">{(["up", "down"] as const).map(direction => <form key={direction} action={moveTemplateItem}><input type="hidden" name="template_id" value={id} /><input type="hidden" name="template_item_id" value={item.id} /><input type="hidden" name="direction" value={direction} /><button title={`Move item ${direction}`} className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-40" disabled={direction === "up" ? index === 0 : index === items.length - 1}>{direction === "up" ? "↑" : "↓"}</button></form>)}</div>
          </div>
          <form action={updateTemplateItem} className="grid gap-3"><input type="hidden" name="template_id" value={id} /><input type="hidden" name="template_item_id" value={item.id} /><ItemFields item={item} /><button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Save Item</button></form>
          <form action={deleteTemplateItem} className="border-t border-neutral-100 pt-3"><input type="hidden" name="template_id" value={id} /><input type="hidden" name="template_item_id" value={item.id} /><button className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Remove Item</button></form>
        </article>)}
        {!items.length && <p className="text-sm text-neutral-500">No template items yet.</p>}
      </section>
    </>}
  </div>;
}
