import { NextResponse } from "next/server";
import { authorizeNrcsService } from "@/lib/nrcsPublication";
import { convertLegacyMarkdown } from "@/lib/legacyMarkdown";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTagBySlug, getTagTree } from "@/lib/tags";
import type { DistrictKey } from "@/lib/districts";
import { migrationEventDay } from "@/apps/nrcs/lib/migrationEventScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TABLES = { terms: "event_classification_terms", stories: "stories", events: "events", slots: "story_slots" } as const;

export async function GET(request: Request) {
  if (!authorizeNrcsService(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind") as keyof typeof TABLES | "tags";
    const district = params.get("district") || "";
    const after = params.get("after");
    const id = params.get("id");
    if ((kind !== "tags" && !Object.hasOwn(TABLES, kind)) || !/^[a-z0-9_-]+$/.test(district)) throw new Error("Invalid migration export request.");
    if (kind === "tags") {
      const definitions = getTagTree(district as DistrictKey).flatMap(node => [node, ...(node.children || [])]);
      const all = definitions.map(node => ({ district_key: district, slug: node.slug, name: node.label })).sort((a, b) => a.slug.localeCompare(b.slug)).filter(row => (!after || row.slug > after) && (!id || row.slug === id));
      const rows = all.slice(0, 10);
      return NextResponse.json({ schema_version: 1, kind, district_key: district, rows, audit: null, remaining: all.length, next: all.length > 10 ? rows.at(-1)?.slug : null }, { headers: { "Cache-Control": "no-store" } });
    }
    const key = kind === "slots" ? "slot" : "id";
    const db = createServiceClient();
    const audit = kind === "terms" && !after && !id ? await db.rpc("nrcs_legacy_migration_audit") : { data: null, error: null };
    if (audit.error) throw new Error(`CMS audit: ${audit.error.message}`);
    let query = db.from(TABLES[kind]).select("*", { count: "exact" }).eq("district_key", district).order(key).limit(10);
    if (kind === "events") {
      const { data: configuration, error: districtError } = await db.from("districts").select("timezone").eq("district_key", district).single();
      if (districtError || !configuration?.timezone) throw new Error(districtError?.message || "District timezone is missing.");
      query = query.gte("start_at", `${migrationEventDay(configuration.timezone)}T00:00:00`);
    }
    if (after && kind !== "slots") query = query.gt(key, after);
    if (id && kind !== "slots") query = query.eq(key, id);
    const { data, error, count } = await query;
    if (error) throw new Error(`CMS ${TABLES[kind]}: ${error.message}`);
    const rows: Record<string, any>[] = kind === "slots" ? [{ district_key: district, slot: "lineup", slots: data || [] }] : data || [];
    if (kind === "stories" || kind === "events") {
      const ownerIds = [...new Set(rows.map(row => row.created_by).filter(Boolean))];
      const owners = ownerIds.length ? await db.from("profiles").select("id,email,display_name").in("id", ownerIds) : { data: [], error: null };
      if (owners.error) throw new Error(owners.error.message);
      const submitterTable = kind === "stories" ? "story_submitters" : "event_submitters";
      const inverseKey = kind === "stories" ? "submitted_story_id" : "submitted_event_id";
      const directIds = rows.map(row => row.submitter_id).filter(Boolean);
      const inverse = rows.length ? await db.from(submitterTable).select("*").in(inverseKey, rows.map(row => row.id)) : { data: [], error: null };
      const direct = directIds.length ? await db.from(submitterTable).select("*").in("id", directIds) : { data: [], error: null };
      if (inverse.error || direct.error) throw new Error(inverse.error?.message || direct.error?.message);
      const contacts = [...(inverse.data || []), ...(direct.data || [])];
      let assignments: Record<string, any>[] = [];
      if (kind === "events" && rows.length) {
        const result = await db.from("event_classification_assignments").select("event_id,event_classification_terms(*)").in("event_id", rows.map(row => row.id));
        if (result.error) throw new Error(result.error.message);
        assignments = result.data || [];
      }
      for (const row of rows) {
        row.author = owners.data?.find(owner => owner.id === row.created_by) || null;
        row.submitters = [...new Map(contacts.filter(contact => contact.id === row.submitter_id || contact[inverseKey] === row.id).map(contact => [contact.id, contact])).values()];
        row.relationship_issues = row.submitters.some((contact: Record<string, any>) => contact[inverseKey] && contact[inverseKey] !== row.id) ? ["Submitter links disagree; review CMS reciprocal links."] : [];
        if (kind === "stories") {
          const conversion = convertLegacyMarkdown(row.body_markdown || "");
          row.converted_html = conversion.html;
          row.conversion_issues = conversion.issues;
          row.tag_definitions = (row.tags || []).map((slug: string) => ({ slug, name: getTagBySlug(district as DistrictKey, slug)?.label || slug }));
          row.image_public_id = row.cloudinary_public_id || null;
          row.image_width = row.cloudinary_width || null;
          row.image_height = row.cloudinary_height || null;
        } else {
          row.classification = assignments.find(assignment => assignment.event_id === row.id)?.event_classification_terms || null;
        }
      }
    }
    return NextResponse.json({ schema_version: 1, kind, district_key: district, rows, audit: audit.data, remaining: kind === "slots" ? 1 : count || 0, next: rows.length === 10 && (count || 0) > 10 ? String(rows.at(-1)?.[key]) : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Export failed." }, { status: 400 });
  }
}
