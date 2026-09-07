import Link from "next/link";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { createNrcsServerClient } from "@/lib/server";
import { createEdition, formatProgramDateTime } from "@/lib/programs";

type ProgramRow = {
  id: string;
  district_key: string;
  name: string;
  enabled: boolean;
};

type EditionRow = {
  id: string;
  program_id: string;
  title: string;
  air_at: string;
  recording_at: string | null;
  status: string;
};

export default async function NrcsProgramsPage({
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

  const supabase = await createNrcsServerClient();
  const nowIso = new Date().toISOString();
  const [{ data: programs, error: programsError }, { data: upcomingEditions }, { data: recentEditions }] = await Promise.all([
    supabase
      .from("nrcs_programs")
      .select("id, district_key, name, enabled")
      .eq("district_key", districtKey)
      .eq("enabled", true)
      .order("name", { ascending: true }),
    supabase
      .from("nrcs_editions")
      .select("id, program_id, title, air_at, recording_at, status")
      .eq("district_key", districtKey)
      .gte("air_at", nowIso)
      .order("air_at", { ascending: true })
      .limit(50),
    supabase
      .from("nrcs_editions")
      .select("id, program_id, title, air_at, recording_at, status")
      .eq("district_key", districtKey)
      .order("air_at", { ascending: false })
      .limit(30),
  ]);

  if (programsError) {
    throw new Error(`Unable to load programs: ${programsError.message}`);
  }

  const programRows = (programs || []) as ProgramRow[];
  const upcomingRows = (upcomingEditions || []) as EditionRow[];
  const recentRows = (recentEditions || []) as EditionRow[];
  const nextByProgram = new Map<string, EditionRow>();
  upcomingRows.forEach((edition) => {
    if (!nextByProgram.has(edition.program_id)) nextByProgram.set(edition.program_id, edition);
  });

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Programs</h1>
          <p className="text-sm text-neutral-500">District programs, upcoming editions, and production rundowns.</p>
        </div>
        <form className="flex flex-wrap gap-2">
          <select name="district" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2 text-sm">
            {allowedDistricts.map((district) => (
              <option key={district.district_key} value={district.district_key}>
                {district.display_name}
              </option>
            ))}
          </select>
          <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Apply</button>
        </form>
      </header>

      {resolvedSearchParams.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{resolvedSearchParams.error}</p>}
      {resolvedSearchParams.success && <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">Program update saved.</p>}

      <section className="grid gap-4 lg:grid-cols-3">
        {programRows.map((program) => {
          const next = nextByProgram.get(program.id);
          return (
            <article key={program.id} className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
              <div>
                <h2 className="text-lg font-semibold">{program.name}</h2>
                <p className="text-sm text-neutral-500">
                  {next ? (
                    <>
                      Next: <Link href={`/editions/${next.id}`} className="font-medium underline">{next.title}</Link> at {formatProgramDateTime(next.air_at)}
                    </>
                  ) : (
                    "No upcoming edition scheduled."
                  )}
                </p>
              </div>
              <form action={createEdition} className="grid gap-3">
                <input type="hidden" name="program_id" value={program.id} />
                <input type="hidden" name="district_key" value={districtKey} />
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Edition Title</span>
                  <input name="title" placeholder={`${program.name} - local date`} className="rounded border border-neutral-300 px-3 py-2" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Scheduled Air Date/Time</span>
                  <input name="air_at" type="datetime-local" required className="rounded border border-neutral-300 px-3 py-2" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Recording Date/Time</span>
                  <input name="recording_at" type="datetime-local" className="rounded border border-neutral-300 px-3 py-2" />
                </label>
                <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Create Edition</button>
              </form>
            </article>
          );
        })}
        {programRows.length === 0 && (
          <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">No enabled programs exist for this district.</p>
        )}
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Edition</div>
          <div>Program</div>
          <div>Air Time</div>
          <div>Status</div>
        </div>
        {recentRows.map((edition) => {
          const program = programRows.find((row) => row.id === edition.program_id);
          return (
            <Link
              key={edition.id}
              href={`/editions/${edition.id}`}
              className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 border-b border-neutral-100 px-4 py-3 text-sm hover:bg-neutral-50"
            >
              <span className="font-medium underline">{edition.title}</span>
              <span>{program?.name || "-"}</span>
              <span>{formatProgramDateTime(edition.air_at)}</span>
              <span className="capitalize">{edition.status}</span>
            </Link>
          );
        })}
        {recentRows.length === 0 && <p className="px-4 py-6 text-sm text-neutral-500">No editions exist yet.</p>}
      </section>
    </div>
  );
}
