import Link from "next/link";
import { notFound } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { createProgramTemplate } from "@/lib/programs";
import { createNrcsServerClient } from "@/lib/server";

export default async function NewTemplatePage({ searchParams }: { searchParams: Promise<{ program?: string; error?: string }> }) {
  await requireNrcsStaff("editor");
  const query = await searchParams;
  const supabase = await createNrcsServerClient();
  const { data: program, error } = await supabase.from("nrcs_programs").select("id, name, district_key").eq("id", query.program || "").maybeSingle();
  if (error) throw new Error(error.message);
  if (!program) notFound();
  return <div className="grid max-w-3xl gap-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Create Template</h1><Link href={`/programs?district=${program.district_key}`} className="text-sm underline">Back to Programs</Link></header>
    <p className="text-sm text-neutral-500">{program.name}</p>
    {query.error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-red-700">{query.error}</p>}
    <form action={createProgramTemplate} className="grid gap-4">
      <input type="hidden" name="program_id" value={program.id} />
      <input type="hidden" name="district_key" value={program.district_key} />
      <label className="grid gap-1 text-sm">Template Name<input name="name" required className="rounded border border-neutral-300 px-3 py-2" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked />Enabled</label>
      <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Create Template</button>
    </form>
  </div>;
}
