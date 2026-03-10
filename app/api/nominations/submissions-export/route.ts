import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  NOMINATION_CATEGORY_LABELS,
  type NominationCategory,
} from "@/lib/nominations";

type NominationSubmission = {
  id: string;
  category: NominationCategory;
  submitter_name: string;
  submitter_email: string;
  submitter_phone: string;
  payload: Record<string, unknown>;
  submitted_at: string;
};

function csvCell(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function getNomineeName(row: NominationSubmission) {
  const data = row.payload || {};
  if (row.category === "athletes") return String(data.athlete_name || "");
  if (row.category === "teachers") return String(data.teacher_name || "");
  if (row.category === "leaders") return String(data.leader_name || "");
  return String(data.worker_name || "");
}

export async function GET(request: Request) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await supabase.rpc("purge_old_nomination_submissions");

  const url = new URL(request.url);
  const category = url.searchParams.get("category") || "all";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";

  let query = supabase
    .from("nomination_submissions")
    .select("id, category, submitter_name, submitter_email, submitter_phone, payload, submitted_at")
    .order("submitted_at", { ascending: false });

  if (category !== "all") {
    query = query.eq("category", category);
  }
  if (from) {
    query = query.gte("submitted_at", `${from}T00:00:00`);
  }
  if (to) {
    query = query.lte("submitted_at", `${to}T23:59:59`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []) as NominationSubmission[];
  const header = [
    "submission_id",
    "category_key",
    "category_label",
    "nominee_name",
    "submitter_name",
    "submitter_email",
    "submitter_phone",
    "submitted_at",
    "payload_json",
  ];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.id,
        row.category,
        NOMINATION_CATEGORY_LABELS[row.category],
        getNomineeName(row),
        row.submitter_name,
        row.submitter_email,
        row.submitter_phone,
        row.submitted_at,
        JSON.stringify(row.payload || {}),
      ]
        .map(csvCell)
        .join(",")
    ),
  ];

  const body = lines.join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"nomination-submissions-${stamp}.csv\"`,
    },
  });
}
