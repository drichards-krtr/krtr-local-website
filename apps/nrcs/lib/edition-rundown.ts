import type { createNrcsServerClient } from "@/lib/server";

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
};

type CopyVersionForItem = {
  id: string;
  version_number: number;
  headline: string | null;
  body_html: string;
};

export async function loadEditionRundown(
  supabase: Awaited<ReturnType<typeof createNrcsServerClient>>,
  editionId: string,
) {
  const { data, error } = await supabase
    .from("nrcs_rundown_items")
    .select("id, item_type, sort_order, title, body_html, segment_kind, story_id, copy_version_id, is_checked")
    .eq("edition_id", editionId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Unable to load rundown items: ${error.message}`);

  const itemRows = (data || []) as RundownItemRow[];
  const copyVersionIds = [...new Set(itemRows.flatMap((item) => item.copy_version_id ? [item.copy_version_id] : []))];
  const { data: copyVersions, error: copyError } = await (
    copyVersionIds.length
      ? supabase.from("nrcs_copy_versions").select("id, version_number, headline, body_html").in("id", copyVersionIds)
      : Promise.resolve({ data: [] as CopyVersionForItem[], error: null })
  );
  if (copyError) throw new Error(`Unable to load rundown copy: ${copyError.message}`);

  const versionsById = new Map(((copyVersions ?? []) as CopyVersionForItem[]).map((version) => [version.id, version]));
  return itemRows.map((item) => ({
    ...item,
    copy_version: item.copy_version_id ? versionsById.get(item.copy_version_id) || null : null,
  }));
}
