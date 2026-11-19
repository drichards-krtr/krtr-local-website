import { notFound } from "next/navigation";
import NrcsPrompter from "@/components/NrcsPrompter";
import { requireNrcsStaff } from "@/lib/auth";
import { loadEditionRundown } from "@/lib/edition-rundown";
import { scriptTextFromHtml } from "@/lib/programs";
import { createNrcsServerClient } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prompter View | KRTR Local NRCS" };

export default async function NrcsPrompterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireNrcsStaff("producer");
  const { id } = await params;
  const supabase = await createNrcsServerClient();
  const { data: edition, error } = await supabase.from("nrcs_editions").select("title").eq("id", id).maybeSingle();
  if (error) throw new Error(`Unable to load edition: ${error.message}`);
  if (!edition) notFound();

  const items = await loadEditionRundown(supabase, id);

  return (
    <NrcsPrompter title={edition.title}>
      {items.filter((item) => item.item_type !== "production_note").map((item) => (
        <article key={item.id}>
          <h2 className="mb-2 text-[0.55em] font-semibold uppercase">{item.title}</h2>
          <p className="whitespace-pre-wrap break-words">{scriptTextFromHtml(
            item.item_type === "story" ? item.copy_version?.body_html : item.body_html,
          ) || "–"}</p>
        </article>
      ))}
      {items.every((item) => item.item_type === "production_note") && <p>No script content exists yet.</p>}
    </NrcsPrompter>
  );
}
