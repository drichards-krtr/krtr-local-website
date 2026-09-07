import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { plainTextToHtml } from "@/lib/richText";
import { createNrcsServerClient } from "@/lib/server";
import { syncNrcsEventById } from "@/lib/eventSyncServer";
import { formatLocalDateTime, INTAKE_STATUSES } from "@/lib/workflow";

type IntakeRow = {
  id: string;
  intake_type: "story_tip" | "calendar_submission";
  district_key: string;
  status: string;
  title: string;
  summary: string | null;
  body: string | null;
  submitter_name: string | null;
  submitter_email: string | null;
  submitter_phone: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

async function updateIntakeStatus(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("editor");
  const id = String(formData.get("id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const status = String(formData.get("status") || "new");
  const allowed = INTAKE_STATUSES.includes(status as never) ? status : "new";
  const supabase = await createNrcsServerClient();
  const { error } = await supabase
    .from("nrcs_intake_items")
    .update({
      status: allowed,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) redirect(`/intake?district=${districtKey}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/intake");
  redirect(`/intake?district=${districtKey}&success=status`);
}

async function convertIntake(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("editor");
  const id = String(formData.get("id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const supabase = await createNrcsServerClient();
  const { data, error } = await supabase
    .from("nrcs_intake_items")
    .select("id, intake_type, district_key, title, summary, body, submitter_name, submitter_email, submitter_phone, payload")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) redirect(`/intake?district=${districtKey}&error=${encodeURIComponent(error?.message || "Intake item not found.")}`);
  const intake = data as IntakeRow;

  if (intake.intake_type === "story_tip") {
    const { data: story, error: storyError } = await supabase
      .from("nrcs_stories")
      .insert({
        district_key: intake.district_key,
        title: intake.title,
        lifecycle_state: "idea",
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select("id")
      .single();

    if (storyError || !story) redirect(`/intake?district=${districtKey}&error=${encodeURIComponent(storyError?.message || "Unable to create Story.")}`);

    const facts = [
      intake.summary ? `Summary: ${intake.summary}` : "",
      intake.body || "",
      intake.submitter_name || intake.submitter_email || intake.submitter_phone
        ? `Submitter: ${[intake.submitter_name, intake.submitter_email, intake.submitter_phone].filter(Boolean).join(" / ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    if (facts) {
      await supabase.from("nrcs_story_facts").insert({
        story_id: story.id,
        body_html: plainTextToHtml(facts),
        created_by: profile.id,
        updated_by: profile.id,
      });
    }

    const imageUrl = String(intake.payload?.image_url || "").trim();
    if (imageUrl) {
      const { data: asset, error: assetError } = await supabase
        .from("nrcs_assets")
        .insert({
          asset_type: "image",
          title: `${intake.title} submitted image`,
          district_key: intake.district_key,
          cloudinary_url: imageUrl,
          metadata: {
            intake_id: intake.id,
            mux_passthrough: String(intake.payload?.mux_passthrough || "") || null,
            source: "public_story_tip",
          },
          created_by: profile.id,
        })
        .select("id")
        .single();

      if (assetError || !asset) {
        redirect(`/intake?district=${districtKey}&error=${encodeURIComponent(assetError?.message || "Unable to attach submitted image.")}`);
      }

      const { error: linkError } = await supabase.from("nrcs_story_assets").insert({
        story_id: story.id,
        asset_id: asset.id,
        relationship: "submitted",
      });

      if (linkError) {
        redirect(`/intake?district=${districtKey}&error=${encodeURIComponent(linkError.message)}`);
      }
    }

    const muxUploadId = String(intake.payload?.mux_upload_id || "").trim();
    if (muxUploadId) {
      const { data: asset, error: assetError } = await supabase
        .from("nrcs_assets")
        .insert({
          asset_type: "video",
          title: `${intake.title} submitted video`,
          district_key: intake.district_key,
          mux_upload_id: muxUploadId,
          mux_status: String(intake.payload?.mux_status || "uploading"),
          metadata: {
            intake_id: intake.id,
            source: "public_story_tip",
          },
          created_by: profile.id,
        })
        .select("id")
        .single();

      if (assetError || !asset) {
        redirect(`/intake?district=${districtKey}&error=${encodeURIComponent(assetError?.message || "Unable to attach submitted video.")}`);
      }

      const { error: linkError } = await supabase.from("nrcs_story_assets").insert({
        story_id: story.id,
        asset_id: asset.id,
        relationship: "submitted",
      });

      if (linkError) {
        redirect(`/intake?district=${districtKey}&error=${encodeURIComponent(linkError.message)}`);
      }
    }

    await supabase
      .from("nrcs_intake_items")
      .update({ status: "converted", reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    revalidatePath("/stories");
    redirect(`/stories/${story.id}?district=${intake.district_key}&success=intake`);
  }

  const payload = intake.payload || {};
  const { data: event, error: eventError } = await supabase
    .from("nrcs_events")
    .insert({
      district_key: intake.district_key,
      title: intake.title,
      body_html: plainTextToHtml(intake.body || intake.summary || ""),
      location_name: String(payload.location_name || ""),
      address: String(payload.address || ""),
      city: String(payload.city || ""),
      state: String(payload.state || "IA"),
      zip: String(payload.zip || ""),
      location: String(payload.location || "") || null,
      start_at: String(payload.start_at || ""),
      end_at: String(payload.end_at || "") || null,
      image_url: String(payload.image_url || "") || null,
      status: "draft",
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (eventError || !event) redirect(`/intake?district=${districtKey}&error=${encodeURIComponent(eventError?.message || "Unable to create Event.")}`);

  await supabase
    .from("nrcs_intake_items")
    .update({ status: "converted", reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  await syncNrcsEventById(event.id);
  revalidatePath("/events");
  redirect(`/events/${event.id}?district=${intake.district_key}&success=intake`);
}

export default async function IntakePage({
  searchParams,
}: {
  searchParams?: Promise<{ district?: string; status?: string; type?: string; error?: string; success?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) || {};
  await requireNrcsStaff("editor");
  const { activeDistrict, allowedDistricts } = await getNrcsDistrictContext();
  const districtKey =
    resolvedSearchParams.district && allowedDistricts.some((district) => district.district_key === resolvedSearchParams.district)
      ? resolvedSearchParams.district
      : activeDistrict?.district_key || "dlpc";
  const status = INTAKE_STATUSES.includes(resolvedSearchParams.status as never) ? resolvedSearchParams.status || "new" : "new";
  const type = ["all", "story_tip", "calendar_submission"].includes(resolvedSearchParams.type || "")
    ? resolvedSearchParams.type || "all"
    : "all";
  const supabase = await createNrcsServerClient();
  let query = supabase
    .from("nrcs_intake_items")
    .select("id, intake_type, district_key, status, title, summary, body, submitter_name, submitter_email, submitter_phone, payload, created_at")
    .eq("district_key", districtKey)
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("status", status);
  if (type !== "all") query = query.eq("intake_type", type);

  const { data, error } = await query.limit(100);
  if (error) throw new Error(`Unable to load intake: ${error.message}`);
  const items = (data || []) as IntakeRow[];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Intake</h1>
          <p className="text-sm text-neutral-500">Story Tips and Community Calendar submissions sent from the public site.</p>
        </div>
        <Link href="/dashboard" className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold">Dashboard</Link>
      </header>

      {resolvedSearchParams.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{resolvedSearchParams.error}</p>}
      {resolvedSearchParams.success && <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">Intake update saved.</p>}

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <select name="district" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {allowedDistricts.map((district) => (
            <option key={district.district_key} value={district.district_key}>{district.display_name}</option>
          ))}
        </select>
        <select name="status" defaultValue={status} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="in_review">In Review</option>
          <option value="converted">Converted</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <select name="type" defaultValue={type} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All types</option>
          <option value="story_tip">Story Tips</option>
          <option value="calendar_submission">Calendar Submissions</option>
        </select>
        <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Apply</button>
      </form>

      <section className="grid gap-4">
        {items.map((item) => (
          <article key={item.id} className="grid gap-3 rounded border border-neutral-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{item.title}</h2>
                <p className="capitalize text-neutral-500">{item.intake_type.replace("_", " ")} - {item.status.replace("_", " ")} - {formatLocalDateTime(item.created_at)}</p>
              </div>
              <form action={updateIntakeStatus} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="district_key" value={districtKey} />
                <select name="status" defaultValue={item.status} className="rounded border border-neutral-300 px-2 py-1">
                  <option value="new">New</option>
                  <option value="in_review">In Review</option>
                  <option value="converted">Converted</option>
                  <option value="dismissed">Dismissed</option>
                </select>
                <button className="rounded border border-neutral-300 px-3 py-1 font-semibold">Update</button>
              </form>
            </div>
            {item.summary && <p className="text-neutral-700">{item.summary}</p>}
            {item.body && <p className="whitespace-pre-wrap text-neutral-700">{item.body}</p>}
            {typeof item.payload?.image_url === "string" && item.payload.image_url && (
              <img
                src={item.payload.image_url}
                alt=""
                className="max-h-64 w-fit rounded border border-neutral-200 object-contain"
              />
            )}
            {typeof item.payload?.mux_upload_id === "string" && item.payload.mux_upload_id && (
              <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-xs">
                <div className="font-semibold">Submitted Video</div>
                <div className="mt-1 break-words">Mux Upload ID: {item.payload.mux_upload_id}</div>
                {typeof item.payload?.mux_passthrough === "string" && item.payload.mux_passthrough && (
                  <div className="mt-1 break-words">Mux Passthrough: {item.payload.mux_passthrough}</div>
                )}
                <div className="mt-1">Status: {String(item.payload.mux_status || "uploading")}</div>
              </div>
            )}
            <dl className="grid gap-1 rounded bg-neutral-50 p-3 text-xs md:grid-cols-[140px_1fr]">
              <dt className="font-semibold">Submitter</dt>
              <dd>{[item.submitter_name, item.submitter_email, item.submitter_phone].filter(Boolean).join(" / ") || "-"}</dd>
              <dt className="font-semibold">Payload</dt>
              <dd className="break-words">{JSON.stringify(item.payload)}</dd>
            </dl>
            {item.status !== "converted" && (
              <form action={convertIntake}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="district_key" value={districtKey} />
                <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
                  {item.intake_type === "story_tip" ? "Create Story" : "Create Event Draft"}
                </button>
              </form>
            )}
          </article>
        ))}
        {items.length === 0 && <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">No intake items match this view.</p>}
      </section>
    </div>
  );
}
