import { NextResponse } from "next/server";
import { getDistrictConfig, resolveDistrictFromHost } from "@/lib/districts";
import { sendIntakeToNrcs } from "@/lib/nrcsIntake";

async function sendSubmissionNotificationEmail(submitterEmail: string, districtName: string) {
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
      subject: `New ${districtName} story submission`,
      text: `There is a new story submission to review for ${districtName}.`,
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
  const districtKey = resolveDistrictFromHost(
    request.headers.get("x-forwarded-host") || request.headers.get("host")
  );
  const district = getDistrictConfig(districtKey);
  const body = await request.json().catch(() => ({}));
  const title = String(body?.title || "").trim();
  const tease = String(body?.tease || "").trim();
  const bodyMarkdown = String(body?.body_markdown || "").trim();
  const imageUrl = String(body?.image_url || "").trim() || null;
  const muxUploadId = String(body?.mux_upload_id || "").trim() || null;
  const muxStatus = String(body?.mux_status || "").trim() || null;
  const muxPassthrough = String(body?.mux_passthrough || "").trim() || null;
  const submitterName = String(body?.submitter_name || "").trim();
  const submitterPhone = String(body?.submitter_phone || "").trim();
  const submitterEmail = String(body?.submitter_email || "").trim();

  if (!title || !bodyMarkdown || !submitterName || !submitterPhone || !submitterEmail) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const externalId = crypto.randomUUID();
  const intakeResult = await sendIntakeToNrcs({
    intake_type: "story_tip",
    district_key: districtKey,
    title,
    summary: tease || null,
    body: bodyMarkdown,
    submitter_name: submitterName,
    submitter_phone: submitterPhone,
    submitter_email: submitterEmail,
    external_source_id: externalId,
    payload: {
      tease: tease || null,
      body_markdown: bodyMarkdown,
      image_url: imageUrl,
      mux_upload_id: muxUploadId,
      mux_status: muxStatus,
      mux_passthrough: muxPassthrough,
    },
  });

  if (!intakeResult.ok) {
    return NextResponse.json(
      { error: `nrcs_intake_failed: ${intakeResult.error}` },
      { status: 502 }
    );
  }

  await sendSubmissionNotificationEmail(submitterEmail, district.name);

  return NextResponse.json({ ok: true, intakeId: intakeResult.intakeId });
}
