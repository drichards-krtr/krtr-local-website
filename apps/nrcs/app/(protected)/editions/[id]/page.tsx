import Link from "next/link";
import { notFound } from "next/navigation";
import RichTextEditor from "@/components/RichTextEditor";
import { requireNrcsStaff } from "@/lib/auth";
import {
  addRundownItem,
  carryStoryItemToTomorrow,
  deleteRundownItem,
  EDITION_STATUSES,
  formatDateTimeLocal,
  formatProgramDateTime,
  moveRundownItem,
  RUNDOWN_ITEM_TYPES,
  scriptTextFromHtml,
  updateEdition,
  updateRundownItem,
} from "@/lib/programs";
import { createNrcsServerClient } from "@/lib/server";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mode?: string; error?: string; success?: string }>;
};

type EditionRow = {
  id: string;
  district_key: string;
  title: string;
  air_at: string;
  recording_at: string | null;
  status: string;
  nrcs_programs: { id: string; name: string } | Array<{ id: string; name: string }> | null;
};

type RundownItemRow = {
  id: string;
  item_type: string;
  sort_order: number;
  title: string;
  body_html: string | null;
  segment_kind: string | null;
  story_id: string | null;
  copy_version_id: string | null;
  is_checked: boolean;
  nrcs_copy_versions:
    | {
        id: string;
        version_number: number;
        headline: string | null;
        body_html: string;
        nrcs_copy_streams: { stream_type: string } | Array<{ stream_type: string }> | null;
      }
    | Array<{
        id: string;
        version_number: number;
        headline: string | null;
        body_html: string;
        nrcs_copy_streams: { stream_type: string } | Array<{ stream_type: string }> | null;
      }>
    | null;
  nrcs_stories: { id: string; title: string; district_key: string } | Array<{ id: string; title: string; district_key: string }> | null;
};

type CopyOptionRow = {
  id: string;
  story_id: string;
  current_version_id: string;
  nrcs_stories: { title: string; district_key: string } | Array<{ title: string; district_key: string }> | null;
};

type CopyOption = {
  copy_version_id: string;
  version_number: number;
  headline: string | null;
  story_title: string;
};

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value || null;
}

function itemTypeLabel(value: string) {
  if (value === "story") return "Story Item";
  if (value === "segment") return "Segment Item";
  if (value === "script") return "Script Item";
  return "Production Note";
}

const SEGMENT_KINDS = ["Intro", "News", "Events", "Weather", "Sports Scores", "Upcoming Sports", "Break", "Outro"];

export default async function NrcsEditionPage({ params, searchParams }: PageProps) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  await requireNrcsStaff("editor");
  const supabase = await createNrcsServerClient();

  const [{ data: edition }, { data: rundownItems }] = await Promise.all([
    supabase
      .from("nrcs_editions")
      .select("id, district_key, title, air_at, recording_at, status, nrcs_programs(id, name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("nrcs_rundown_items")
      .select(
        "id, item_type, sort_order, title, body_html, segment_kind, story_id, copy_version_id, is_checked, nrcs_copy_versions(id, version_number, headline, body_html, nrcs_copy_streams(stream_type)), nrcs_stories(id, title, district_key)"
      )
      .eq("edition_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  if (!edition) notFound();

  const editionRow = edition as unknown as EditionRow;
  const program = one(editionRow.nrcs_programs);
  const items = (rundownItems || []) as unknown as RundownItemRow[];
  const { data: copyStreams } = await supabase
    .from("nrcs_copy_streams")
    .select("id, story_id, current_version_id, nrcs_stories!inner(title, district_key)")
    .eq("stream_type", "rundown")
    .eq("nrcs_stories.district_key", editionRow.district_key)
    .not("current_version_id", "is", null)
    .limit(100);
  const optionStreams = (copyStreams || []) as unknown as CopyOptionRow[];
  const optionVersionIds = optionStreams.map((stream) => stream.current_version_id).filter(Boolean);
  const { data: optionVersions } = optionVersionIds.length
    ? await supabase
        .from("nrcs_copy_versions")
        .select("id, version_number, headline")
        .in("id", optionVersionIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const versionsById = new Map(((optionVersions || []) as Array<{ id: string; version_number: number; headline: string | null }>).map((version) => [version.id, version]));
  const options = optionStreams
    .map((stream) => {
      const version = versionsById.get(stream.current_version_id);
      const story = one(stream.nrcs_stories);
      if (!version || !story) return null;
      return {
        copy_version_id: version.id,
        version_number: version.version_number,
        headline: version.headline,
        story_title: story.title,
      };
    })
    .filter(Boolean) as CopyOption[];
  const scriptMode = resolvedSearchParams?.mode === "script";

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{editionRow.title}</h1>
          <p className="text-sm text-neutral-500">
            {program?.name || "Program"} - Airs {formatProgramDateTime(editionRow.air_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/programs" className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold">
            Back to Programs
          </Link>
          <Link
            href={`/editions/${id}${scriptMode ? "" : "?mode=script"}`}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          >
            {scriptMode ? "Edit Rundown" : "Script View"}
          </Link>
        </div>
      </header>

      {resolvedSearchParams?.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{resolvedSearchParams.error}</p>}
      {resolvedSearchParams?.success && <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">Edition update saved.</p>}

      {scriptMode ? (
        <section className="grid gap-5 rounded border border-neutral-200 bg-white p-6">
          <div>
            <h2 className="text-lg font-semibold">Continuous Script</h2>
            <p className="text-sm text-neutral-500">Production notes are excluded from this view.</p>
          </div>
          {items
            .filter((item) => item.item_type !== "production_note")
            .map((item) => {
              const copyVersion = one(item.nrcs_copy_versions);
              const body = item.item_type === "story" ? copyVersion?.body_html || "" : item.body_html || "";
              return (
                <article key={item.id} className="border-b border-neutral-100 pb-5">
                  <h3 className="text-sm font-semibold uppercase text-neutral-500">{item.title}</h3>
                  <div className="mt-2 whitespace-pre-wrap text-base leading-7">{scriptTextFromHtml(body) || "-"}</div>
                </article>
              );
            })}
          {items.filter((item) => item.item_type !== "production_note").length === 0 && (
            <p className="text-sm text-neutral-500">No script content exists yet.</p>
          )}
        </section>
      ) : (
        <>
          <section className="rounded border border-neutral-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Edition Settings</h2>
            <form action={updateEdition} className="mt-4 grid gap-3 md:grid-cols-2">
              <input type="hidden" name="edition_id" value={editionRow.id} />
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Title</span>
                <input name="title" defaultValue={editionRow.title} required className="rounded border border-neutral-300 px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Status</span>
                <select name="status" defaultValue={editionRow.status} className="rounded border border-neutral-300 px-3 py-2">
                  {EDITION_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Scheduled Air Date/Time</span>
                <input name="air_at" type="datetime-local" defaultValue={formatDateTimeLocal(editionRow.air_at)} required className="rounded border border-neutral-300 px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Recording Date/Time</span>
                <input name="recording_at" type="datetime-local" defaultValue={formatDateTimeLocal(editionRow.recording_at)} className="rounded border border-neutral-300 px-3 py-2" />
              </label>
              <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Save Edition</button>
            </form>
          </section>

          <section className="rounded border border-neutral-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Add Story</h2>
            <form action={addRundownItem} className="mt-4 grid gap-3">
              <input type="hidden" name="edition_id" value={editionRow.id} />
              <input type="hidden" name="item_type" value="story" />
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Story Rundown Copy</span>
                <select name="copy_version_id" required className="rounded border border-neutral-300 px-3 py-2">
                  <option value="">Select Story Rundown Copy</option>
                  {options.map((option) => {
                    return (
                      <option key={option.copy_version_id} value={option.copy_version_id}>
                        {option.story_title} - v{option.version_number}{option.headline ? ` - ${option.headline}` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Rundown Item Title</span>
                <input name="title" placeholder="Defaults to the Rundown Copy headline or Story title" className="rounded border border-neutral-300 px-3 py-2" />
              </label>
              <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white" disabled={options.length === 0}>
                Add Story To Rundown
              </button>
              {options.length === 0 && <p className="text-sm text-neutral-500">No Story Rundown Copy versions exist for this district.</p>}
            </form>
          </section>

          <section className="rounded border border-neutral-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Add Segment, Script, or Note</h2>
            <form action={addRundownItem} className="mt-4 grid gap-3">
              <input type="hidden" name="edition_id" value={editionRow.id} />
              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Type</span>
                  <select name="item_type" defaultValue="script" className="rounded border border-neutral-300 px-3 py-2">
                    {RUNDOWN_ITEM_TYPES.filter((type) => type !== "story").map((type) => (
                      <option key={type} value={type}>{itemTypeLabel(type)}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Title</span>
                  <input name="title" required className="rounded border border-neutral-300 px-3 py-2" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Segment Kind</span>
                  <select name="segment_kind" className="rounded border border-neutral-300 px-3 py-2">
                    <option value="">None</option>
                    {SEGMENT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>{kind}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-1 text-sm">
                <span className="font-medium">Body</span>
                <RichTextEditor name="body_html" />
              </div>
              <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Add Item</button>
            </form>
          </section>

          <section className="grid gap-4">
            <h2 className="text-lg font-semibold">Rundown</h2>
            {items.map((item, index) => {
              const copyVersion = one(item.nrcs_copy_versions);
              const story = one(item.nrcs_stories);
              return (
                <article key={item.id} className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase text-neutral-500">{index + 1}. {itemTypeLabel(item.item_type)}</div>
                      <h3 className="text-lg font-semibold">{item.title}</h3>
                      {item.item_type === "story" && story && (
                        <Link href={`/stories/${story.id}?district=${story.district_key}`} className="text-sm font-semibold underline">
                          Open Story
                        </Link>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <form action={moveRundownItem}>
                        <input type="hidden" name="edition_id" value={editionRow.id} />
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="direction" value="up" />
                        <button className="rounded border border-neutral-300 px-3 py-1 text-sm font-semibold" disabled={index === 0}>Up</button>
                      </form>
                      <form action={moveRundownItem}>
                        <input type="hidden" name="edition_id" value={editionRow.id} />
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="direction" value="down" />
                        <button className="rounded border border-neutral-300 px-3 py-1 text-sm font-semibold" disabled={index === items.length - 1}>Down</button>
                      </form>
                    </div>
                  </div>

                  {item.item_type === "story" && (
                    <div className="rounded border border-neutral-100 bg-neutral-50 p-4 text-sm">
                      <div className="font-semibold">Rundown Copy v{copyVersion?.version_number || "-"}</div>
                      <div className="mt-2 whitespace-pre-wrap leading-6">{scriptTextFromHtml(copyVersion?.body_html) || "-"}</div>
                    </div>
                  )}

                  <form action={updateRundownItem} className="grid gap-3">
                    <input type="hidden" name="edition_id" value={editionRow.id} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <input type="hidden" name="item_type" value={item.item_type} />
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Title</span>
                      <input name="title" defaultValue={item.title} required className="rounded border border-neutral-300 px-3 py-2" />
                    </label>
                    {item.item_type === "segment" && (
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium">Segment Kind</span>
                        <select name="segment_kind" defaultValue={item.segment_kind || ""} className="rounded border border-neutral-300 px-3 py-2">
                          <option value="">None</option>
                          {SEGMENT_KINDS.map((kind) => (
                            <option key={kind} value={kind}>{kind}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {item.item_type !== "story" && (
                      <div className="grid gap-1 text-sm">
                        <span className="font-medium">Body</span>
                        <RichTextEditor name="body_html" initialHtml={item.body_html || ""} />
                      </div>
                    )}
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input name="is_checked" type="checkbox" defaultChecked={item.is_checked} />
                      <span>Checked in rundown</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Save Item</button>
                    </div>
                  </form>

                  <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                    {item.item_type === "story" && (
                      <>
                        <form action={carryStoryItemToTomorrow}>
                          <input type="hidden" name="edition_id" value={editionRow.id} />
                          <input type="hidden" name="item_id" value={item.id} />
                          <input type="hidden" name="carry_mode" value="same" />
                          <button className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">Carry To Tomorrow</button>
                        </form>
                        <form action={carryStoryItemToTomorrow}>
                          <input type="hidden" name="edition_id" value={editionRow.id} />
                          <input type="hidden" name="item_id" value={item.id} />
                          <input type="hidden" name="carry_mode" value="updated" />
                          <button className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">Carry With New Copy Version</button>
                        </form>
                      </>
                    )}
                    <form action={deleteRundownItem}>
                      <input type="hidden" name="edition_id" value={editionRow.id} />
                      <input type="hidden" name="item_id" value={item.id} />
                      <button className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Remove Item</button>
                    </form>
                  </div>
                </article>
              );
            })}
            {items.length === 0 && <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">No rundown items exist yet.</p>}
          </section>
        </>
      )}
    </div>
  );
}
