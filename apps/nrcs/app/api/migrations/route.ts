import { NextResponse } from "next/server";
import { getCurrentNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import { MIGRATION_KINDS, MIGRATION_FALLBACK_AUTHOR_EMAIL, fetchLegacy, migrationHash, normalizeLegacy, verifyLegacyMedia } from "@/lib/migration";
import { isPastMigrationEvent, migrationEventDay } from "@/lib/migrationEventScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
function checked<T extends { error: { message: string } | null }>(result: T): T {
  if (result.error) throw new Error(result.error.message);
  return result;
}
async function client() {
  const staff = await getCurrentNrcsStaff();
  if (!staff) throw new Error("Unauthorized.");
  if (staff.profile.role !== "admin") throw new Error("Admin access required.");
  return { db: await createNrcsServerClient(), staff };
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Migration failed.";
  return NextResponse.json({ error: message }, { status: message === "Unauthorized." ? 401 : message === "Admin access required." ? 403 : 400 });
}

export async function GET(request: Request) {
  try {
    const { db } = await client();
    const params = new URL(request.url).searchParams;
    const runId = params.get("run");
    const page = Math.max(0, Math.min(100000, Number(params.get("page") || 0) || 0));
    const { data: runs } = checked(await db.from("nrcs_migration_runs").select("*").order("created_at", { ascending: false }).limit(20));
    if (!runId) return NextResponse.json({ runs }, { headers: { "Cache-Control": "no-store" } });
    const { data: run } = checked(await db.from("nrcs_migration_runs").select("*").eq("id", runId).single());
    const { data: items, count } = checked(await db.from("nrcs_migration_items").select("id,kind,source_id,status,detail,errors,warnings,normalized", { count: "exact" }).eq("run_id", runId).order("kind").order("source_id").range(page * 50, page * 50 + 49));
    const { data: summary } = checked(await db.rpc("nrcs_migration_report", { p_run: runId }));
    const { data: legacyTags } = checked(await db.from("nrcs_migration_items").select("source_id,raw").eq("run_id", runId).eq("kind", "tags").order("source_id").limit(1000));
    const canonicalTags = [];
    for (let offset = 0; ; offset += 500) {
      const { data: tags } = checked(await db.from("nrcs_tags").select("id,name,slug").order("name").order("id").range(offset, offset + 499));
      canonicalTags.push(...(tags || []));
      if (!tags || tags.length < 500) break;
    }
    return NextResponse.json({ runs, run, items, count, page, summary, canonicalTags, legacyTags: (legacyTags || []).map(tag => ({ slug: tag.source_id, name: tag.raw.name })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  let lease: string | null = null;
  let activeRun: string | null = null;
  let db: Awaited<ReturnType<typeof createNrcsServerClient>> | null = null;
  try {
    const context = await client(); db = context.db;
    const body = await request.json();
    if (body.action === "start") {
      const { data: district } = checked(await db.from("nrcs_districts").select("district_key").eq("district_key", String(body.district)).single());
      if (!district) throw new Error("District is unavailable.");
      const { data: previous } = checked(await db.from("nrcs_migration_runs").select("id,tag_mappings").eq("district_key", district.district_key).in("phase", ["ready", "complete"]).order("created_at", { ascending: false }).limit(1).maybeSingle());
      const { data: run } = checked(await db.from("nrcs_migration_runs").insert({ district_key: district.district_key, created_by: context.staff.profile.id, parent_run_id: previous?.id || null, tag_mappings: previous?.tag_mappings || {} }).select("*").single());
      return NextResponse.json({ run });
    }
    const runId = String(body.run || "");
    const { data: run } = checked(await db.from("nrcs_migration_runs").select("*").eq("id", runId).single());
    if (body.action === "tag_mapping") {
      if (!["ready", "complete"].includes(run.phase)) throw new Error("Finish or stop processing before reviewing tag mappings.");
      const choices = body.mappings || [{ source_slug: body.source_slug, tag_id: body.tag_id }];
      if (!Array.isArray(choices) || !choices.length || choices.length > 100) throw new Error("Choose between 1 and 100 tag mappings per refresh.");
      const mappings = { ...(run.tag_mappings || {}) };
      for (const choice of choices) {
        const slug = String(choice.source_slug || "");
        checked(await db.from("nrcs_migration_items").select("id").eq("run_id", runId).eq("kind", "tags").eq("source_id", slug).single());
        const { data: snapshot } = checked(await db.rpc("nrcs_migration_tag_snapshot", { p_source_slug: slug, p_tag: String(choice.tag_id || "") }));
        mappings[slug] = snapshot;
      }
      const { data: nextRun } = checked(await db.from("nrcs_migration_runs").insert({ district_key: run.district_key, created_by: context.staff.profile.id, parent_run_id: run.id, tag_mappings: mappings }).select("*").single());
      return NextResponse.json({ run: nextRun });
    }
    const { data: token } = checked(await db.rpc("nrcs_migration_claim", { p_run: runId }));
    lease = String(token); activeRun = runId;
    let update: Record<string, unknown> = { last_error: null };
    if (body.action === "cancel") {
      if (!["scan", "ready", "import"].includes(run.phase)) throw new Error("Run is already finished.");
      update = { ...update, phase: "cancelled", last_error: "Stopped by administrator; any committed imports remain intact." };
    } else if (body.action === "mapping") {
      if (run.phase !== "ready") throw new Error("Mappings can only be reviewed before Import.");
      const { data: item } = checked(await db.from("nrcs_migration_items").select("*").eq("run_id", runId).eq("id", String(body.item)).single());
      if (!["stories", "events"].includes(item.kind) || item.status === "removed") throw new Error("This item cannot be mapped.");
      const mapping = { ...(item.normalized.mapping || {}) };
      if (Object.hasOwn(body, "owner_id")) {
        if (body.owner_id) checked(await db.from("nrcs_staff_profiles").select("id").eq("id", String(body.owner_id)).single());
        mapping.owner_id = body.owner_id ? String(body.owner_id) : null;
      }
      if (Object.hasOwn(body, "classification_target_id")) {
        if (body.classification_target_id) checked(await db.from("nrcs_event_classification_terms").select("id").eq("district_key", run.district_key).eq("id", String(body.classification_target_id)).eq("enabled", true).single());
        mapping.classification_target_id = body.classification_target_id ? String(body.classification_target_id) : null;
      }
      const { data: district } = checked(await db.from("nrcs_districts").select("timezone").eq("district_key", run.district_key).single());
      if (!district) throw new Error("District unavailable.");
      const result = normalizeLegacy(item.kind, item.raw, item.normalized.owner_id, new Date(run.created_at), district.timezone, mapping);
      const { data: identity } = checked(await db.from("nrcs_migration_identities").select("target_id,target_hash").eq("district_key", run.district_key).eq("kind", item.kind).eq("source_id", item.source_id).maybeSingle());
      const assessment = checked(await db.rpc("nrcs_migration_assess", { p_kind: item.kind, p_target: identity?.target_id || result.normalized.target_id, p_baseline: identity?.target_hash || null, p_normalized: result.normalized })).data;
      result.errors.push(...(assessment || []), ...await verifyLegacyMedia(item.raw));
      checked(await db.from("nrcs_migration_items").update({ ...result, status: "pending", detail: null }).eq("id", item.id));
    } else if (body.action === "import") {
      if (run.phase !== "ready" || body.confirmation !== "IMPORT THIS DISTRICT") throw new Error("A completed dry run and typed confirmation are required.");
      if (!["import", "delta"].includes(body.mode)) throw new Error("Invalid import mode.");
      update = { ...update, phase: "import", mode: body.mode };
    } else if (body.action === "step" && run.phase === "scan") {
      if (run.kind_index < MIGRATION_KINDS.length) {
        const kind = MIGRATION_KINDS[run.kind_index];
        const batch = await fetchLegacy(kind, run.district_key, run.cursor);
        const { data: district } = checked(await db.from("nrcs_districts").select("timezone").eq("district_key", run.district_key).single());
        if (!district) throw new Error("District is unavailable.");
        const fallbackAuthor = ["stories", "events"].includes(kind)
          ? checked(await db.from("nrcs_staff_profiles").select("id").eq("email", MIGRATION_FALLBACK_AUTHOR_EMAIL).eq("active", true).maybeSingle()).data
          : null;
        if (["stories", "events"].includes(kind) && !fallbackAuthor) throw new Error(`Migration fallback author ${MIGRATION_FALLBACK_AUTHOR_EMAIL} must have an active NRCS staff profile.`);
        const emails = [...new Set(batch.rows.map(row => row.author?.email?.toLowerCase()).filter(Boolean))];
        const owners = emails.length ? checked(await db.from("nrcs_staff_profiles").select("id,email").in("email", emails)) : { data: [] };
        const items = batch.rows.map(row => {
          const owner = owners.data?.find(user => user.email.toLowerCase() === row.author?.email?.toLowerCase())?.id || null;
          const result = normalizeLegacy(kind, row, owner, new Date(run.created_at), district.timezone, { tags: run.tag_mappings || {} }, fallbackAuthor?.id || null);
          return { run_id: runId, kind, source_id: result.normalized.source_id, source_hash: migrationHash(row), raw: row, ...result };
        });
        const mediaIssues = await Promise.all(batch.rows.map(row => verifyLegacyMedia(row)));
        items.forEach((item, index) => item.errors.push(...mediaIssues[index]));
        // Surface existing target edits/collisions during Dry Run, not only Import.
        for (const item of items) {
          const { data: identity } = checked(await db.from("nrcs_migration_identities").select("target_id,target_hash,mapping").eq("district_key", run.district_key).eq("kind", kind).eq("source_id", item.source_id).maybeSingle());
          const prior = run.parent_run_id ? checked(await db.from("nrcs_migration_items").select("normalized").eq("run_id", run.parent_run_id).eq("kind", kind).eq("source_id", item.source_id).maybeSingle()).data?.normalized?.mapping : null;
          if (prior || identity?.mapping && Object.keys(identity.mapping).length) {
            const combined = { ...(identity?.mapping || {}), ...(prior || {}), tags: { ...(identity?.mapping?.tags || {}), ...(prior?.tags || {}), ...(run.tag_mappings || {}) } };
            const result = normalizeLegacy(kind, item.raw, item.normalized.owner_id, new Date(run.created_at), district.timezone, combined, fallbackAuthor?.id || null);
            item.normalized = result.normalized; item.errors = [...result.errors, ...mediaIssues[items.indexOf(item)]]; item.warnings = result.warnings;
          }
          if (kind === "tags" && item.normalized.mapping.tags?.[item.source_id]) {
            const chosen = item.normalized.mapping.tags[item.source_id];
            const result = await db.rpc("nrcs_migration_tag_snapshot", { p_source_slug: item.source_id, p_tag: chosen.id });
            if (result.error || migrationHash(result.data) !== migrationHash(chosen)) item.errors.push(result.error?.message || "Chosen canonical tag changed; review mapping again.");
          } else {
            const { data: assessment } = checked(await db.rpc("nrcs_migration_assess", { p_kind: kind, p_target: identity?.target_id || item.normalized.target_id, p_baseline: identity?.target_hash || null, p_normalized: item.normalized }));
            item.errors.push(...(assessment || []));
          }
        }
        if (items.length) checked(await db.from("nrcs_migration_items").upsert(items, { onConflict: "run_id,kind,source_id" }));
        const sourceCounts = { ...run.source_counts };
        if (!run.cursor) sourceCounts[kind] = batch.remaining;
        update = { ...update, source_counts: sourceCounts, ...(batch.audit ? { source_audit: batch.audit } : {}), cursor: batch.next, kind_index: batch.next ? run.kind_index : run.kind_index + 1 };
      } else {
        // Compare the complete manifest against prior identities, in bounded pages.
        let query = db.from("nrcs_migration_identities").select("*").eq("district_key", run.district_key).order("id").limit(10);
        if (run.cursor) query = query.gt("id", run.cursor);
        const { data: identities } = checked(await query);
        const { data: district } = checked(await db.from("nrcs_districts").select("timezone").eq("district_key", run.district_key).single());
        if (!district?.timezone) throw new Error("District timezone is unavailable.");
        const eventDay = migrationEventDay(district.timezone);
        for (const identity of identities || []) {
          const { data: present } = checked(await db.from("nrcs_migration_items").select("id").eq("run_id", runId).eq("kind", identity.kind).eq("source_id", identity.source_id).maybeSingle());
          if (!present && !(identity.kind === "events" && isPastMigrationEvent(identity.provenance?.start_at, eventDay))) checked(await db.from("nrcs_migration_items").upsert({ run_id: runId, kind: identity.kind, source_id: identity.source_id, source_hash: identity.source_hash, raw: {}, normalized: {}, status: "removed", errors: ["Source no longer exists; target retained."], detail: "No automatic delete or unpublish" }, { onConflict: "run_id,kind,source_id" }));
        }
        update = { ...update, cursor: identities?.length === 10 ? identities.at(-1)?.id : null, phase: identities?.length === 10 ? "scan" : "ready" };
      }
    } else if (body.action === "step" && run.phase === "import") {
      // One atomic item per request keeps CMS rechecks and writes bounded.
      let next: Record<string, any> | undefined;
      for (const kind of MIGRATION_KINDS) {
        const { data: candidates } = checked(await db.from("nrcs_migration_items").select("*").eq("run_id", runId).eq("status", "pending").eq("kind", kind).order("source_id").limit(1));
        if (candidates?.length) { next = candidates[0]; break; }
      }
      if (!next) update.phase = "complete";
      else if (next.errors.length) checked(await db.from("nrcs_migration_items").update({ status: "blocked", detail: "Resolve exceptions and run another dry run" }).eq("id", next.id));
      else {
        const current = await fetchLegacy(next.kind, run.district_key, null, next.source_id);
        if (!current.rows.length || migrationHash(current.rows[0]) !== next.source_hash) {
          checked(await db.from("nrcs_migration_items").update({ status: "conflict", detail: "CMS source changed since Dry Run; start a fresh run" }).eq("id", next.id));
        } else {
          const mediaErrors = await verifyLegacyMedia(current.rows[0]);
          if (mediaErrors.length) checked(await db.from("nrcs_migration_items").update({ status: "blocked", errors: mediaErrors, detail: "Media verification failed at import time" }).eq("id", next.id));
          else checked(await db.rpc("nrcs_migration_apply", { p_item: next.id, p_token: lease }));
        }
      }
    } else throw new Error("This run has no batch available.");
    checked(await db.from("nrcs_migration_runs").update({ ...update, lease_token: null, lease_until: null, updated_at: new Date().toISOString() }).eq("id", runId).eq("lease_token", lease));
    lease = null;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (db && lease && activeRun) await db.from("nrcs_migration_runs").update({ last_error: error instanceof Error ? error.message : "Batch failed", lease_token: null, lease_until: null }).eq("id", activeRun).eq("lease_token", lease);
    return failure(error);
  }
}
