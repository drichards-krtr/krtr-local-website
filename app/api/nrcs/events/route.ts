import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

type EventPayload = {
  id: string;
  district_key: string;
  title: string;
  body_html: string | null;
  location_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  location: string | null;
  start_at: string;
  end_at: string | null;
  image_url: string | null;
  status: "draft" | "published" | "archived";
  classification: {
    kind: "sport" | "extra_curricular" | "event_type";
    name: string;
    enabled: boolean;
  } | null;
};

function isAuthorized(request: Request) {
  const expected = process.env.CMS_NRCS_API_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && supplied && supplied === expected);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as EventPayload;
  if (!payload.id || !payload.district_key || !payload.title || !payload.start_at) {
    return NextResponse.json({ error: "Missing required event fields" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: event, error: eventError } = await service
    .from("events")
    .upsert(
      {
        nrcs_source_id: payload.id,
        district_key: payload.district_key,
        title: payload.title,
        description: null,
        body_html: payload.body_html,
        location_name: payload.location_name,
        address: payload.address,
        city: payload.city,
        state: payload.state,
        zip: payload.zip,
        location: payload.location,
        start_at: payload.start_at,
        end_at: payload.end_at,
        image_url: payload.image_url,
        status: payload.status,
        is_school_sports: payload.classification?.kind === "sport",
      },
      { onConflict: "nrcs_source_id" }
    )
    .select("id")
    .single();

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  await service.from("event_classification_assignments").delete().eq("event_id", event.id);

  if (payload.classification) {
    const { data: term, error: termError } = await service
      .from("event_classification_terms")
      .upsert(
        {
          district_key: payload.district_key,
          kind: payload.classification.kind,
          name: payload.classification.name,
          enabled: payload.classification.enabled,
        },
        { onConflict: "district_key,kind,name" }
      )
      .select("id")
      .single();

    if (termError) {
      return NextResponse.json({ error: termError.message }, { status: 500 });
    }

    const { error: assignmentError } = await service.from("event_classification_assignments").insert({
      event_id: event.id,
      term_id: term.id,
    });

    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, event_id: event.id });
}
