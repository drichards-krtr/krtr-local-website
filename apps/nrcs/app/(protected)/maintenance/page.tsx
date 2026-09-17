import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import ResetSubmit from "./ResetSubmit";

const CONFIRMATION = "DELETE ALL NRCS EDITORIAL CONTENT";

async function resetEditorial(formData: FormData) {
  "use server";
  await requireNrcsStaff("admin");
  if (formData.get("confirmation") !== CONFIRMATION) {
    redirect("/maintenance?error=Confirmation%20does%20not%20match");
  }
  const supabase = await createNrcsServerClient();
  const { error } = await supabase.rpc("nrcs_temporary_editorial_reset", {
    p_confirmation: CONFIRMATION,
  });
  if (error) redirect(`/maintenance?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect("/maintenance?success=1");
}

export default async function MaintenancePage({ searchParams }: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireNrcsStaff("admin");
  const params = await searchParams;
  const supabase = await createNrcsServerClient();
  const { data, error } = await supabase.rpc("nrcs_temporary_editorial_reset");
  const counts = (data || {}) as Record<string, number>;
  return <div className="max-w-3xl space-y-5">
    <h1 className="text-2xl font-semibold">Temporary Editorial Reset</h1>
    <p className="text-sm text-neutral-700">Permanently deletes NRCS editorial content across all districts, including Sources, document records and the Asset library. This cannot be undone.</p>
    <p className="text-sm text-neutral-700">Preserves staff, districts, taxonomy, Programs/templates, school identities and school logos, and audit records. CMS and hosted media files are not deleted.</p>
    {params.success && <p role="status" className="border border-green-600 bg-green-50 p-3">Editorial reset completed successfully.</p>}
    {(params.error || error) && <p role="alert" className="border border-red-600 bg-red-50 p-3">{params.error || error?.message}</p>}
    <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Records To Delete</th><th className="py-2 text-right">Count</th></tr></thead>
      <tbody>{Object.entries(counts).map(([table, count]) => <tr key={table} className="border-b"><td className="py-2">{table.replace(/^nrcs_/, "").replaceAll("_", " ")}</td><td className="py-2 text-right">{count}</td></tr>)}</tbody>
    </table>
    <form action={resetEditorial} className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="confirmation">Type {CONFIRMATION} to confirm</label>
      <input id="confirmation" name="confirmation" required autoComplete="off" className="w-full rounded border border-neutral-300 p-2" />
      <ResetSubmit disabled={Boolean(error)} />
    </form>
  </div>;
}
