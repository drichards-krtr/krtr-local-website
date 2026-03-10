import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  NOMINATION_CATEGORIES,
  NOMINATION_CATEGORY_LABELS,
  type NominationCategory,
} from "@/lib/nominations";

type NominationSubmission = {
  id: string;
  nomination_id: string | null;
  category: NominationCategory;
  submitter_name: string;
  submitter_email: string;
  submitter_phone: string;
  payload: Record<string, unknown>;
  submitted_at: string;
};

function getNomineeName(row: NominationSubmission) {
  const data = row.payload || {};
  if (row.category === "athletes") return String(data.athlete_name || "-");
  if (row.category === "teachers") return String(data.teacher_name || "-");
  if (row.category === "leaders") return String(data.leader_name || "-");
  return String(data.worker_name || "-");
}

export default async function NominationSubmissionsPage({
  searchParams,
}: {
  searchParams: { category?: string; from?: string; to?: string; error?: string; success?: string };
}) {
  const supabase = createServerSupabase();

  await supabase.rpc("purge_old_nomination_submissions");

  const categoryFilter = searchParams.category || "all";
  const from = searchParams.from || "";
  const to = searchParams.to || "";

  let query = supabase
    .from("nomination_submissions")
    .select("id, nomination_id, category, submitter_name, submitter_email, submitter_phone, payload, submitted_at")
    .order("submitted_at", { ascending: false });

  if (categoryFilter !== "all") {
    query = query.eq("category", categoryFilter);
  }
  if (from) {
    query = query.gte("submitted_at", `${from}T00:00:00`);
  }
  if (to) {
    query = query.lte("submitted_at", `${to}T23:59:59`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`[NominationSubmissionsPage] ${error.message}`);
  }

  const rows = (data || []) as NominationSubmission[];
  const exportHref = `/api/nominations/submissions-export?category=${encodeURIComponent(
    categoryFilter
  )}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  async function deleteSubmission(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const id = String(formData.get("id") || "");
    const { error } = await supabase.from("nomination_submissions").delete().eq("id", id);
    if (error) {
      redirect(`/cms/nominations/submissions?error=${encodeURIComponent(error.message)}`);
    }
    revalidatePath("/cms/nominations/submissions");
    redirect("/cms/nominations/submissions");
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Nomination Submissions</h1>
          <p className="text-sm text-neutral-500">
            Admin-only submissions list. Data older than 90 days is purged automatically.
          </p>
        </div>
        <div className="flex gap-3">
          <a href={exportHref} className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold">
            Export CSV
          </a>
          <Link href="/cms/nominations" className="text-sm underline">
            Back to Nominations
          </Link>
        </div>
      </header>

      {searchParams.error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {searchParams.error}
        </div>
      )}
      {searchParams.success && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Submission updated.
        </div>
      )}

      <form className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 bg-white p-4">
        <div className="grid gap-1">
          <label className="text-xs font-semibold uppercase text-neutral-500">Category</label>
          <select
            name="category"
            defaultValue={categoryFilter}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            {NOMINATION_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {NOMINATION_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs font-semibold uppercase text-neutral-500">From</label>
          <input
            name="from"
            type="date"
            defaultValue={from}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs font-semibold uppercase text-neutral-500">To</label>
          <input
            name="to"
            type="date"
            defaultValue={to}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Apply
        </button>
      </form>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[1.5fr_1.5fr_1.5fr_1fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Category</div>
          <div>Nominee</div>
          <div>Submitter</div>
          <div>Submitted</div>
          <div>Contact</div>
          <div>Actions</div>
        </div>

        {rows.length === 0 && (
          <div className="px-4 py-6 text-sm text-neutral-500">No submissions found.</div>
        )}

        {rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[1.5fr_1.5fr_1.5fr_1fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
          >
            <div>{NOMINATION_CATEGORY_LABELS[row.category]}</div>
            <div>{getNomineeName(row)}</div>
            <div>{row.submitter_name}</div>
            <div className="text-neutral-600">{new Date(row.submitted_at).toLocaleDateString()}</div>
            <div className="text-xs text-neutral-600">
              <div>{row.submitter_email}</div>
              <div>{row.submitter_phone}</div>
            </div>
            <div className="flex gap-3">
              <Link href={`/cms/nominations/submissions/${row.id}`} className="underline">
                Edit
              </Link>
              <form action={deleteSubmission}>
                <input type="hidden" name="id" value={row.id} />
                <button type="submit" className="text-red-700 underline">
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
