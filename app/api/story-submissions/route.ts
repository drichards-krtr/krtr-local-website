import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

async function sendSubmissionNotificationEmail(submitterEmail: string) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn("[StorySubmission] RESEND_API_KEY missing; skipping email notification.");
    return;
  }

  const from =
    process.env.STORY_SUBMISSION_EMAIL_FROM ||
    process.env.EVENT_SUBMISSION_EMAIL_FROM ||
    "onboarding@resend.dev";
  const notifyTo =
    process.env.STORY_SUBMISSION_NOTIFY_TO ||
    process.env.EVENT_SUBMISSION_NOTIFY_TO ||
    "hello@krtrlocal.tv";
  const to = notifyTo
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: submitterEmail,
      subject: "New Story submission",
      text: "There is a new story submission to review.",
    }),
  }).catch((error) => {
    console.error("[StorySubmission] Resend request failed", error);
    return null;
  });

  if (!response) return;
  if (!response.ok) {
    const detail = await response.text();
    console.error("[StorySubmission] Resend rejected email", {
      status: response.status,
      detail,
      from,
      to,
    });
    return;
  }
  console.info("[StorySubmission] notification email sent", { to });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = String(body?.title || "").trim();
  const tease = String(body?.tease || "").trim();
  const bodyMarkdown = String(body?.body_markdown || "").trim();
  const imageUrl = String(body?.image_url || "").trim() || null;
  const submitterName = String(body?.submitter_name || "").trim();
  const submitterPhone = String(body?.submitter_phone || "").trim();
  const submitterEmail = String(body?.submitter_email || "").trim();

  if (!title || !bodyMarkdown || !submitterName || !submitterPhone || !submitterEmail) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: submitter, error: submitterError } = await service
    .from("story_submitters")
    .insert({
      name: submitterName,
      phone: submitterPhone,
      email: submitterEmail,
    })
    .select("id")
    .single();
  if (submitterError) {
    return NextResponse.json(
      { error: `submitter_insert_failed: ${submitterError.message}` },
      { status: 500 }
    );
  }

  const { data: story, error: storyError } = await service
    .from("stories")
    .insert({
      title,
      tease: tease || null,
      body_markdown: bodyMarkdown,
      status: "draft",
      image_url: imageUrl,
      submitter_id: submitter.id,
      mux_status: "none",
    })
    .select("id")
    .single();

  if (storyError) {
    return NextResponse.json(
      { error: `story_insert_failed: ${storyError.message}` },
      { status: 500 }
    );
  }

  await service
    .from("story_submitters")
    .update({ submitted_story_id: story.id })
    .eq("id", submitter.id);

  await sendSubmissionNotificationEmail(submitterEmail);

  return NextResponse.json({ ok: true, storyId: story.id });
}
