import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { DISTRICT_OPTIONS, parseDistrictKey } from "@/lib/districts";
import { formatDateInTimeZone, formatDateTimeInTimeZone } from "@/lib/dates";

type SessionRow = {
  id: string;
  district_key: string;
  slug: string;
  name: string;
  open_date: string;
  close_date: string;
  page_copy: string;
  status: string;
};

type SubmissionRow = {
  id: string;
  session_id: string;
  address: string;
  status: string;
  created_at: string;
  garage_sale_sessions: { name: string } | { name: string }[] | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function revalidateGarageSalePaths(districtKey: string) {
  revalidatePath("/garage-sales");
  revalidatePath("/garage-sales/submit");
  revalidatePath(`/cms/garage-sales?district=${districtKey}`);
}

function getSessionName(submission: SubmissionRow) {
  const relation = submission.garage_sale_sessions;
  if (Array.isArray(relation)) return relation[0]?.name || "-";
  return relation?.name || "-";
}

export default async function GarageSalesCmsPage({
  searchParams,
}: {
  searchParams?: { district?: string; status?: string; saved?: string };
}) {
  const supabase = createServerSupabase();
  const districtKey = parseDistrictKey(searchParams?.district) || "dlpc";
  const status = searchParams?.status || "draft";

  const [{ data: sessions }, { data: submissions }] = await Promise.all([
    supabase
      .from("garage_sale_sessions")
      .select("id, district_key, slug, name, open_date, close_date, page_copy, status")
      .eq("district_key", districtKey)
      .order("open_date", { ascending: false }),
    supabase
      .from("garage_sale_submissions")
      .select("id, session_id, address, status, created_at, garage_sale_sessions(name)")
      .eq("district_key", districtKey)
      .eq("status", status)
      .order("created_at", { ascending: false }),
  ]);

  async function createSession(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const name = String(formData.get("name") || "").trim();
    const slug = slugify(String(formData.get("slug") || name));
    const result = await supabase.from("garage_sale_sessions").insert({
      district_key: nextDistrictKey,
      name,
      slug,
      open_date: String(formData.get("open_date") || ""),
      close_date: String(formData.get("close_date") || ""),
      page_copy: String(formData.get("page_copy") || "").trim(),
      status: String(formData.get("status") || "active"),
    });

    if (result.error) {
      throw new Error(`Unable to create garage sale session: ${result.error.message}`);
    }

    revalidateGarageSalePaths(nextDistrictKey);
    redirect(`/cms/garage-sales?district=${nextDistrictKey}&saved=session-created`);
  }

  async function updateSession(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const id = String(formData.get("id") || "");
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const name = String(formData.get("name") || "").trim();
    const slug = slugify(String(formData.get("slug") || name));
    const result = await supabase
      .from("garage_sale_sessions")
      .update({
        district_key: nextDistrictKey,
        name,
        slug,
        open_date: String(formData.get("open_date") || ""),
        close_date: String(formData.get("close_date") || ""),
        page_copy: String(formData.get("page_copy") || "").trim(),
        status: String(formData.get("status") || "active"),
      })
      .eq("id", id);

    if (result.error) {
      throw new Error(`Unable to update garage sale session: ${result.error.message}`);
    }

    revalidateGarageSalePaths(nextDistrictKey);
    redirect(`/cms/garage-sales?district=${nextDistrictKey}&saved=session-updated`);
  }

  async function updateSubmissionStatus(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const id = String(formData.get("id") || "");
    const nextStatus = String(formData.get("status") || "draft");
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const result = await supabase
      .from("garage_sale_submissions")
      .update({ status: nextStatus })
      .eq("id", id)
      .eq("district_key", nextDistrictKey);

    if (result.error) {
      throw new Error(`Unable to update garage sale submission: ${result.error.message}`);
    }

    revalidateGarageSalePaths(nextDistrictKey);
    redirect(`/cms/garage-sales?district=${nextDistrictKey}&status=${status}`);
  }

  const sessionRows = (sessions || []) as SessionRow[];
  const submissionRows = (submissions || []) as SubmissionRow[];

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Garage Sales</h1>
        <p className="text-sm text-neutral-500">
          Manage city-wide garage sale sessions and submitted sale listings.
        </p>
      </header>

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <select
          name="district"
          defaultValue={districtKey}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {DISTRICT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="draft">Draft submissions</option>
          <option value="published">Published submissions</option>
          <option value="archived">Archived submissions</option>
        </select>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Apply
        </button>
        {searchParams?.saved && (
          <p className="self-center text-sm text-green-700">Saved.</p>
        )}
      </form>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">New Garage Sale Session</h2>
        <form action={createSession} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="district_key" value={districtKey} />
          <input
            name="name"
            placeholder="LPC Citywide Spring Garage Sales"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="slug"
            placeholder="Optional URL slug"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <label className="grid gap-1 text-sm font-medium text-neutral-700">
            <span>Open date</span>
            <input
              name="open_date"
              type="date"
              required
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-neutral-700">
            <span>Close date</span>
            <input
              name="close_date"
              type="date"
              required
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
          <select
            name="status"
            defaultValue="active"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <textarea
            name="page_copy"
            placeholder="Public page copy. Markdown is supported."
            className="min-h-[120px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
          />
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white md:col-span-2"
          >
            Create Session
          </button>
        </form>
      </section>

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">Sessions</h2>
        {sessionRows.length === 0 ? (
          <div className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
            No garage sale sessions for this district.
          </div>
        ) : (
          sessionRows.map((session) => (
            <form
              key={session.id}
              action={updateSession}
              className="grid gap-3 rounded border border-neutral-200 bg-white p-4 md:grid-cols-2"
            >
              <input type="hidden" name="id" value={session.id} />
              <input type="hidden" name="district_key" value={districtKey} />
              <input
                name="name"
                defaultValue={session.name}
                required
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="slug"
                defaultValue={session.slug}
                required
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <label className="grid gap-1 text-sm font-medium text-neutral-700">
                <span>Open date</span>
                <input
                  name="open_date"
                  type="date"
                  defaultValue={session.open_date}
                  required
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-neutral-700">
                <span>Close date</span>
                <input
                  name="close_date"
                  type="date"
                  defaultValue={session.close_date}
                  required
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
              </label>
              <select
                name="status"
                defaultValue={session.status}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
              <p className="self-center text-sm text-neutral-500">
                Public window: {formatDateInTimeZone(session.open_date)} -{" "}
                {formatDateInTimeZone(session.close_date)}
              </p>
              <textarea
                name="page_copy"
                defaultValue={session.page_copy || ""}
                className="min-h-[120px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
              />
              <button
                type="submit"
                className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white md:col-span-2"
              >
                Save Session
              </button>
            </form>
          ))
        )}
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Address</div>
          <div>Session</div>
          <div>Submitted</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {submissionRows.length === 0 ? (
          <p className="p-4 text-sm text-neutral-600">No submissions match this filter.</p>
        ) : (
          submissionRows.map((submission) => (
            <div
              key={submission.id}
              className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
            >
              <div>{submission.address}</div>
              <div className="text-neutral-500">{getSessionName(submission)}</div>
              <div className="text-neutral-500">
                {formatDateTimeInTimeZone(submission.created_at, {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </div>
              <div className="capitalize">{submission.status}</div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/cms/garage-sales/submissions/${submission.id}?district=${districtKey}&status=${status}`}
                  className="text-sm underline"
                >
                  Review
                </Link>
                {submission.status !== "published" && (
                  <form action={updateSubmissionStatus}>
                    <input type="hidden" name="district_key" value={districtKey} />
                    <input type="hidden" name="id" value={submission.id} />
                    <input type="hidden" name="status" value="published" />
                    <button type="submit" className="text-sm underline">
                      Publish
                    </button>
                  </form>
                )}
                {submission.status !== "archived" && (
                  <form action={updateSubmissionStatus}>
                    <input type="hidden" name="district_key" value={districtKey} />
                    <input type="hidden" name="id" value={submission.id} />
                    <input type="hidden" name="status" value="archived" />
                    <button type="submit" className="text-sm underline">
                      Archive
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
