import Link from "next/link";
import { notFound } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { createEdition, EDITION_PRODUCTION_MODES } from "@/lib/programs";
import { createNrcsServerClient } from "@/lib/server";

export default async function NewEditionPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  await requireNrcsStaff("editor");
  const query = await searchParams;
  const supabase = await createNrcsServerClient();
  const { data: template, error } = await supabase.from("nrcs_program_templates").select("id, program_id, name, enabled").eq("id", query.template || "").maybeSingle();
  if (error) throw new Error(error.message);
  if (!template || !template.enabled) notFound();
  const { data: program, error: programError } = await supabase.from("nrcs_programs").select("id, name, district_key, enabled").eq("id", template.program_id).maybeSingle();
  if (programError) throw new Error(programError.message);
  if (!program || !program.enabled) notFound();
  const districtKey = program.district_key;
  const { data: district } = await supabase.from("nrcs_districts").select("timezone").eq("district_key", districtKey).maybeSingle();
  const timezone = district?.timezone || "America/Chicago";
  return <div className="grid max-w-4xl gap-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Create Rundown from Template</h1><p className="text-sm text-neutral-500">{program.name} - {template.name}</p></div><Link href={`/programs?district=${districtKey}`} className="text-sm underline">Back to Programs</Link></header>
              <form action={createEdition} className="grid gap-3 border-t border-neutral-100 pt-4 md:grid-cols-2">
                <input type="hidden" name="program_id" value={program.id} />
                <input type="hidden" name="district_key" value={districtKey} />
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Edition Title</span>
                  <input name="title" placeholder={`${program.name} - local date`} className="rounded border border-neutral-300 px-3 py-2" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Template</span>
                  <select defaultValue={template.id} name="template_id" className="rounded border border-neutral-300 px-3 py-2">
                    <option value="">Selected template</option>
                    {[template].map((template) => (
                      <option key={template.id} value={template.id} disabled={!template.enabled}>
                        {template.name}{!template.enabled ? " - disabled" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="grid gap-1 text-sm">
                  <legend className="font-medium">Mode</legend>
                  <div className="grid grid-cols-2 rounded border border-neutral-300 p-1">
                    {EDITION_PRODUCTION_MODES.map((mode) => (
                      <label key={mode} className="cursor-pointer">
                        <input
                          type="radio"
                          name="production_mode"
                          value={mode}
                          defaultChecked={mode === "recorded"}
                          className="peer sr-only"
                        />
                        <span className="block rounded px-3 py-2 text-center text-sm font-semibold capitalize peer-checked:bg-neutral-900 peer-checked:text-white">
                          {mode}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Scheduled Air Date/Time ({timezone})</span>
                  <input name="air_at" type="datetime-local" required className="rounded border border-neutral-300 px-3 py-2" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Recording Date/Time ({timezone})</span>
                  <input name="recording_at" type="datetime-local" className="rounded border border-neutral-300 px-3 py-2" />
                </label>
                <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Create Rundown</button>
              </form>

  </div>;
}
