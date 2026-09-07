import Link from "next/link";
import RichTextEditor from "@/components/RichTextEditor";
import NrcsEditionCalendar, { type EditionCalendarItem } from "@/components/NrcsEditionCalendar";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { formatDateTimeInTimeZone, getDateTextInTimeZone, getDayRangeInTimeZone } from "@/lib/localDates";
import { createNrcsServerClient } from "@/lib/server";
import {
  addTemplateItem,
  createEdition,
  createProgram,
  createProgramTemplate,
  deleteTemplateItem,
  RUNDOWN_ITEM_TYPES,
  updateProgram,
  updateProgramTemplate,
  updateTemplateItem,
} from "@/lib/programs";

const SEGMENT_KINDS = ["Intro", "News", "Events", "Weather", "Sports Scores", "Upcoming Sports", "Break", "Outro"];

type ProgramRow = {
  id: string;
  district_key: string;
  name: string;
  enabled: boolean;
};

type TemplateRow = {
  id: string;
  program_id: string;
  name: string;
  enabled: boolean;
};

type TemplateItemRow = {
  id: string;
  template_id: string;
  item_type: string;
  title: string;
  body_html: string | null;
  segment_kind: string | null;
  sort_order: number;
};

type EditionRow = {
  id: string;
  program_id: string;
  title: string;
  air_at: string;
  recording_at: string | null;
  status: string;
};

function itemTypeLabel(value: string) {
  if (value === "segment") return "Segment Item";
  if (value === "script") return "Script Item";
  if (value === "production_note") return "Production Note";
  return "Story Item";
}

function addDays(dateText: string, days: number) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function weekStartFor(dateText: string) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return addDays(dateText, -date.getUTCDay());
}

function localTimeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function NrcsProgramsPage({
  searchParams,
}: {
  searchParams?: Promise<{ district?: string; program?: string; week?: string; error?: string; success?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) || {};
  await requireNrcsStaff("editor");
  const { activeDistrict, allowedDistricts } = await getNrcsDistrictContext();
  const districtKey =
    resolvedSearchParams.district && allowedDistricts.some((district) => district.district_key === resolvedSearchParams.district)
      ? resolvedSearchParams.district
      : activeDistrict?.district_key || "dlpc";
  const district = allowedDistricts.find((option) => option.district_key === districtKey) || activeDistrict;
  const timezone = district?.timezone || "America/Chicago";
  const weekStart = weekStartFor(resolvedSearchParams.week || getDateTextInTimeZone(new Date(), timezone));
  const weekEnd = addDays(weekStart, 7);
  const programFilter = resolvedSearchParams.program || "all";
  const range = getDayRangeInTimeZone(weekStart, timezone);
  const rangeEnd = getDayRangeInTimeZone(weekEnd, timezone);

  const supabase = await createNrcsServerClient();
  const [{ data: programs, error: programsError }, { data: templates }, { data: templateItems }] = await Promise.all([
    supabase
      .from("nrcs_programs")
      .select("id, district_key, name, enabled")
      .eq("district_key", districtKey)
      .order("name", { ascending: true }),
    supabase.from("nrcs_program_templates").select("id, program_id, name, enabled").order("name", { ascending: true }),
    supabase
      .from("nrcs_program_template_items")
      .select("id, template_id, item_type, title, body_html, segment_kind, sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  if (programsError) throw new Error(`Unable to load programs: ${programsError.message}`);

  const programRows = (programs || []) as ProgramRow[];
  const programIds = programRows.map((program) => program.id);
  let editionsQuery = supabase
    .from("nrcs_editions")
    .select("id, program_id, title, air_at, recording_at, status")
    .eq("district_key", districtKey)
    .gte("air_at", range.startIso)
    .lt("air_at", rangeEnd.startIso)
    .order("air_at", { ascending: true });
  if (programFilter !== "all") editionsQuery = editionsQuery.eq("program_id", programFilter);
  const { data: editions, error: editionsError } = await editionsQuery.limit(200);
  if (editionsError) throw new Error(`Unable to load editions: ${editionsError.message}`);

  const templateRows = ((templates || []) as TemplateRow[]).filter((template) => programIds.includes(template.program_id));
  const templateItemsByTemplate = new Map<string, TemplateItemRow[]>();
  ((templateItems || []) as TemplateItemRow[]).forEach((item) => {
    templateItemsByTemplate.set(item.template_id, [...(templateItemsByTemplate.get(item.template_id) || []), item]);
  });
  const templatesByProgram = new Map<string, TemplateRow[]>();
  templateRows.forEach((template) => {
    templatesByProgram.set(template.program_id, [...(templatesByProgram.get(template.program_id) || []), template]);
  });
  const programById = new Map(programRows.map((program) => [program.id, program]));
  const calendarItems: EditionCalendarItem[] = ((editions || []) as EditionRow[]).map((edition) => ({
    id: edition.id,
    programId: edition.program_id,
    programName: programById.get(edition.program_id)?.name || "Program",
    title: edition.title,
    airAt: edition.air_at,
    recordingAt: edition.recording_at ? formatDateTimeInTimeZone(edition.recording_at, timezone) : null,
    status: edition.status,
    localDate: getDateTextInTimeZone(edition.air_at, timezone),
    localTime: localTimeLabel(edition.air_at, timezone),
  }));

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Programs</h1>
          <p className="text-sm text-neutral-500">District programs, future templates, and scheduled editions.</p>
        </div>
        <form className="flex flex-wrap gap-2">
          <select name="district" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2 text-sm">
            {allowedDistricts.map((option) => (
              <option key={option.district_key} value={option.district_key}>{option.display_name}</option>
            ))}
          </select>
          <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Apply</button>
        </form>
      </header>

      {resolvedSearchParams.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{resolvedSearchParams.error}</p>}
      {resolvedSearchParams.success && <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">Program update saved.</p>}

      <section className="rounded border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Create Program</h2>
        <form action={createProgram} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input type="hidden" name="district_key" value={districtKey} />
          <input name="name" placeholder="Program name" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <label className="inline-flex items-center gap-2 text-sm">
            <input name="enabled" type="checkbox" defaultChecked />
            Enabled
          </label>
          <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Create Program</button>
        </form>
      </section>

      <section className="grid gap-4">
        {programRows.map((program) => {
          const programTemplates = templatesByProgram.get(program.id) || [];
          return (
            <article key={program.id} className="grid gap-5 rounded border border-neutral-200 bg-white p-5">
              <form action={updateProgram} className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <input type="hidden" name="program_id" value={program.id} />
                <input type="hidden" name="district_key" value={districtKey} />
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Program Name</span>
                  <input name="name" defaultValue={program.name} required className="rounded border border-neutral-300 px-3 py-2" />
                </label>
                <label className="inline-flex items-center gap-2 self-end text-sm">
                  <input name="enabled" type="checkbox" defaultChecked={program.enabled} />
                  Enabled
                </label>
                <button className="self-end rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Save Program</button>
              </form>

              <form action={createEdition} className="grid gap-3 border-t border-neutral-100 pt-4 md:grid-cols-2">
                <input type="hidden" name="program_id" value={program.id} />
                <input type="hidden" name="district_key" value={districtKey} />
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Edition Title</span>
                  <input name="title" placeholder={`${program.name} - local date`} className="rounded border border-neutral-300 px-3 py-2" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Template</span>
                  <select name="template_id" className="rounded border border-neutral-300 px-3 py-2">
                    <option value="">First enabled template</option>
                    {programTemplates.map((template) => (
                      <option key={template.id} value={template.id} disabled={!template.enabled}>
                        {template.name}{!template.enabled ? " - disabled" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Scheduled Air Date/Time ({timezone})</span>
                  <input name="air_at" type="datetime-local" required className="rounded border border-neutral-300 px-3 py-2" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Recording Date/Time ({timezone})</span>
                  <input name="recording_at" type="datetime-local" className="rounded border border-neutral-300 px-3 py-2" />
                </label>
                <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Create Edition</button>
              </form>

              <div className="grid gap-4 border-t border-neutral-100 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">Templates</h3>
                  <form action={createProgramTemplate} className="flex flex-wrap gap-2">
                    <input type="hidden" name="program_id" value={program.id} />
                    <input type="hidden" name="district_key" value={districtKey} />
                    <input name="name" placeholder="Template name" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input name="enabled" type="checkbox" defaultChecked />
                      Enabled
                    </label>
                    <button className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">Create Template</button>
                  </form>
                </div>

                {programTemplates.map((template) => (
                  <section key={template.id} className="grid gap-3 rounded border border-neutral-100 p-4">
                    <form action={updateProgramTemplate} className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                      <input type="hidden" name="template_id" value={template.id} />
                      <input type="hidden" name="district_key" value={districtKey} />
                      <input name="name" defaultValue={template.name} required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input name="enabled" type="checkbox" defaultChecked={template.enabled} />
                        Enabled
                      </label>
                      <button className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">Save Template</button>
                    </form>
                    {(templateItemsByTemplate.get(template.id) || []).map((item) => (
                      <form key={item.id} action={updateTemplateItem} className="grid gap-2 rounded border border-neutral-100 p-3">
                        <input type="hidden" name="template_item_id" value={item.id} />
                        <input type="hidden" name="district_key" value={districtKey} />
                        <div className="grid gap-2 md:grid-cols-3">
                          <select name="item_type" defaultValue={item.item_type} className="rounded border border-neutral-300 px-3 py-2 text-sm">
                            {RUNDOWN_ITEM_TYPES.filter((type) => type !== "story").map((type) => (
                              <option key={type} value={type}>{itemTypeLabel(type)}</option>
                            ))}
                          </select>
                          <input name="title" defaultValue={item.title} required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
                          <select name="segment_kind" defaultValue={item.segment_kind || ""} className="rounded border border-neutral-300 px-3 py-2 text-sm">
                            <option value="">No segment kind</option>
                            {SEGMENT_KINDS.map((kind) => (
                              <option key={kind} value={kind}>{kind}</option>
                            ))}
                          </select>
                        </div>
                        <RichTextEditor name="body_html" initialHtml={item.body_html || ""} />
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Save Item</button>
                          <button formAction={deleteTemplateItem} className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">
                            Remove Item
                          </button>
                        </div>
                      </form>
                    ))}
                    <form action={addTemplateItem} className="grid gap-2 rounded border border-neutral-100 p-3">
                      <input type="hidden" name="template_id" value={template.id} />
                      <input type="hidden" name="district_key" value={districtKey} />
                      <div className="grid gap-2 md:grid-cols-3">
                        <select name="item_type" defaultValue="script" className="rounded border border-neutral-300 px-3 py-2 text-sm">
                          {RUNDOWN_ITEM_TYPES.filter((type) => type !== "story").map((type) => (
                            <option key={type} value={type}>{itemTypeLabel(type)}</option>
                          ))}
                        </select>
                        <input name="title" placeholder="Template item title" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
                        <select name="segment_kind" className="rounded border border-neutral-300 px-3 py-2 text-sm">
                          <option value="">No segment kind</option>
                          {SEGMENT_KINDS.map((kind) => (
                            <option key={kind} value={kind}>{kind}</option>
                          ))}
                        </select>
                      </div>
                      <RichTextEditor name="body_html" />
                      <button className="w-fit rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">Add Template Item</button>
                    </form>
                  </section>
                ))}
                {programTemplates.length === 0 && <p className="text-sm text-neutral-500">No templates exist for this program.</p>}
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Editions Calendar</h2>
            <p className="text-sm text-neutral-500">Showing week of {weekStart} in {timezone}.</p>
          </div>
          <form className="flex flex-wrap gap-2">
            <input type="hidden" name="district" value={districtKey} />
            <input name="week" type="date" defaultValue={weekStart} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
            <select name="program" defaultValue={programFilter} className="rounded border border-neutral-300 px-3 py-2 text-sm">
              <option value="all">All Programs</option>
              {programRows.map((program) => (
                <option key={program.id} value={program.id}>{program.name}</option>
              ))}
            </select>
            <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Apply</button>
            <Link href={`/programs?district=${districtKey}&program=${programFilter}&week=${addDays(weekStart, -7)}`} className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">
              Previous
            </Link>
            <Link href={`/programs?district=${districtKey}&program=${programFilter}&week=${addDays(weekStart, 7)}`} className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">
              Next
            </Link>
          </form>
        </div>
        <NrcsEditionCalendar editions={calendarItems} weekStart={weekStart} />
      </section>
    </div>
  );
}
