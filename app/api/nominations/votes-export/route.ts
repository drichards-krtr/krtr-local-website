import { NextResponse } from "next/server";
import { getDateTextInTimeZone } from "@/lib/dates";
import { parseDistrictKey, resolveDistrictFromHost } from "@/lib/districts";
import {
  getNomineeName,
  getVotingGroupLabel,
  type VotingSession,
} from "@/lib/nominationVoting";
import { NOMINATION_CATEGORY_LABELS, type NominationCategory } from "@/lib/nominations";
import { createServerSupabase } from "@/lib/supabase/server";

type NominationSubmission = {
  id: string;
  category: NominationCategory;
  payload: Record<string, unknown>;
};

type Finalist = {
  id: string;
  voting_group: string;
  nomination_submissions?: NominationSubmission | NominationSubmission[];
};

type Vote = {
  finalist_id: string;
};

type Winner = {
  finalist_id: string;
};

function csvCell(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function getFinalistSubmission(finalist: Finalist) {
  return Array.isArray(finalist.nomination_submissions)
    ? finalist.nomination_submissions[0]
    : finalist.nomination_submissions;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const queryDistrict = parseDistrictKey(url.searchParams.get("district"));
  const districtKey =
    queryDistrict ||
    resolveDistrictFromHost(request.headers.get("x-forwarded-host") || request.headers.get("host"));
  const sessionId = url.searchParams.get("session") || "";

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: sessionData, error: sessionError } = await supabase
    .from("nomination_voting_sessions")
    .select("id, district_key, nomination_id, category, slug, title, open_date, close_date, status_override, created_at")
    .eq("id", sessionId)
    .eq("district_key", districtKey)
    .maybeSingle();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!sessionData) return NextResponse.json({ error: "not found" }, { status: 404 });

  const session = sessionData as VotingSession;
  const [{ data: finalistsData, error: finalistsError }, { data: votesData }, { data: winnersData }] =
    await Promise.all([
      supabase
        .from("nomination_voting_finalists")
        .select("id, voting_group, nomination_submissions(id, category, payload)")
        .eq("session_id", session.id)
        .order("voting_group", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase.from("nomination_votes").select("finalist_id").eq("session_id", session.id),
      supabase.from("nomination_voting_winners").select("finalist_id").eq("session_id", session.id),
    ]);

  if (finalistsError) return NextResponse.json({ error: finalistsError.message }, { status: 500 });

  const finalists = (finalistsData || []) as Finalist[];
  const votes = (votesData || []) as Vote[];
  const winners = new Set(((winnersData || []) as Winner[]).map((winner) => winner.finalist_id));
  const voteCounts = new Map<string, number>();
  for (const vote of votes) {
    voteCounts.set(vote.finalist_id, (voteCounts.get(vote.finalist_id) || 0) + 1);
  }

  const header = [
    "session_id",
    "session_title",
    "category",
    "group",
    "group_label",
    "finalist_id",
    "nominee_name",
    "votes",
    "manual_winner",
  ];
  const lines = [
    header.join(","),
    ...finalists.map((finalist) => {
      const submission = getFinalistSubmission(finalist);
      return [
        session.id,
        session.title,
        NOMINATION_CATEGORY_LABELS[session.category],
        finalist.voting_group,
        getVotingGroupLabel(session.category, finalist.voting_group),
        finalist.id,
        submission ? getNomineeName(submission.category, submission.payload || {}) : "",
        voteCounts.get(finalist.id) || 0,
        winners.has(finalist.id) ? "yes" : "no",
      ]
        .map(csvCell)
        .join(",");
    }),
  ];

  const body = lines.join("\n");
  const stamp = getDateTextInTimeZone();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"nomination-votes-${session.slug}-${stamp}.csv\"`,
    },
  });
}
