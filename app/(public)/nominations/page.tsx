import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Markdown from "@/components/public/Markdown";
import { createServiceClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentOpenNomination } from "@/lib/nominationsServer";
import {
  NOMINATION_CATEGORY_LABELS,
  type NominationCategory,
} from "@/lib/nominations";

export const dynamic = "force-dynamic";

type NominationCopy = {
  category: NominationCategory;
  title: string;
  body_markdown: string;
  submit_button_text: string;
  success_message: string;
};

async function sendSubmissionNotificationEmail(args: {
  submitterEmail: string;
  category: NominationCategory;
  nominationId: string;
  submittedAt: string;
  payload: Record<string, unknown>;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn("[NominationSubmission] RESEND_API_KEY missing; skipping email notification.");
    return;
  }

  const from =
    process.env.NOMINATION_SUBMISSION_EMAIL_FROM ||
    process.env.STORY_SUBMISSION_EMAIL_FROM ||
    process.env.EVENT_SUBMISSION_EMAIL_FROM ||
    "onboarding@resend.dev";
  const to = ["hello@krtrlocal.tv"];

  const lines = [
    "New nomination submission",
    "",
    `Category: ${NOMINATION_CATEGORY_LABELS[args.category]} (${args.category})`,
    `Nomination ID: ${args.nominationId}`,
    `Submitted At: ${args.submittedAt}`,
    `Reply To: ${args.submitterEmail}`,
    "",
    "Full payload:",
    JSON.stringify(args.payload, null, 2),
  ];

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: args.submitterEmail,
      subject: `New ${NOMINATION_CATEGORY_LABELS[args.category]} nomination`,
      text: lines.join("\n"),
    }),
  }).catch((error) => {
    console.error("[NominationSubmission] Resend request failed", error);
    return null;
  });

  if (!response) return;
  if (!response.ok) {
    const detail = await response.text();
    console.error("[NominationSubmission] Resend rejected email", {
      status: response.status,
      detail,
      from,
      to,
    });
    return;
  }
}

export default async function NominationsPublicPage({
  searchParams,
}: {
  searchParams: { success?: string };
}) {
  const nomination = await getCurrentOpenNomination();

  if (!nomination) {
    return (
      <main className="mx-auto max-w-site px-4 py-6">
        <section className="rounded-lg bg-white p-6">
          <h1 className="text-2xl font-semibold">Nominations</h1>
          <p className="mt-3 text-sm text-neutral-700">No nominations open at this time.</p>
        </section>
      </main>
    );
  }

  const activeNomination = nomination;
  const publicSupabase = createPublicClient();
  const { data: copyData } = await publicSupabase
    .from("nomination_copy")
    .select("category, title, body_markdown, submit_button_text, success_message")
    .eq("category", activeNomination.category)
    .maybeSingle();

  const copy = (copyData as NominationCopy | null) || {
    category: activeNomination.category,
    title: `${NOMINATION_CATEGORY_LABELS[activeNomination.category]} Nominations`,
    body_markdown: "",
    submit_button_text: "Submit Nomination",
    success_message: "Thank You For Nominating",
  };

  async function submitNomination(formData: FormData) {
    "use server";

    const latestOpen = await getCurrentOpenNomination();
    if (!latestOpen || latestOpen.id !== activeNomination.id) {
      redirect("/nominations");
    }

    // Placeholder honeypot for future anti-spam rollout.
    const website = String(formData.get("website") || "").trim();
    if (website) {
      redirect("/nominations?success=1");
    }

    const submitterName = String(formData.get("submitter_name") || "").trim();
    const submitterEmail = String(formData.get("submitter_email") || "").trim();
    const submitterPhone = String(formData.get("submitter_phone") || "").trim();

    if (!submitterName || !submitterEmail || !submitterPhone) {
      redirect("/nominations");
    }

    const category = activeNomination.category;
    const payload: Record<string, unknown> = {
      nomination_id: activeNomination.id,
      category,
      submitter_name: submitterName,
      submitter_email: submitterEmail,
      submitter_phone: submitterPhone,
    };

    if (category === "athletes") {
      payload.athlete_name = String(formData.get("athlete_name") || "").trim();
      payload.boy_or_girl = String(formData.get("boy_or_girl") || "").trim();
      payload.grade = String(formData.get("grade") || "").trim();
      payload.sport = String(formData.get("sport") || "").trim();
      payload.why_nominate = String(formData.get("why_nominate") || "").trim();
      payload.parent_guardian_contact = String(
        formData.get("parent_guardian_contact") || ""
      ).trim();
      if (
        !payload.athlete_name ||
        !payload.boy_or_girl ||
        !payload.grade ||
        !payload.sport ||
        !payload.why_nominate ||
        !payload.parent_guardian_contact
      ) {
        redirect("/nominations");
      }
    } else if (category === "teachers") {
      payload.teacher_name = String(formData.get("teacher_name") || "").trim();
      payload.grade_or_subject = String(formData.get("grade_or_subject") || "").trim();
      payload.campus = String(formData.get("campus") || "").trim();
      payload.why_nominate = String(formData.get("why_nominate") || "").trim();
      if (
        !payload.teacher_name ||
        !payload.grade_or_subject ||
        !payload.campus ||
        !payload.why_nominate
      ) {
        redirect("/nominations");
      }
    } else if (category === "leaders") {
      payload.leader_name = String(formData.get("leader_name") || "").trim();
      payload.leader_phone = String(formData.get("leader_phone") || "").trim();
      payload.leader_email = String(formData.get("leader_email") || "").trim();
      payload.why_nominate = String(formData.get("why_nominate") || "").trim();
      if (!payload.leader_name || !payload.why_nominate) {
        redirect("/nominations");
      }
    } else {
      payload.worker_name = String(formData.get("worker_name") || "").trim();
      payload.worker_phone = String(formData.get("worker_phone") || "").trim();
      payload.worker_email = String(formData.get("worker_email") || "").trim();
      payload.why_nominate = String(formData.get("why_nominate") || "").trim();
      if (!payload.worker_name || !payload.why_nominate) {
        redirect("/nominations");
      }
    }

    const service = createServiceClient();
    await service.rpc("purge_old_nomination_submissions");

    const { error } = await service.from("nomination_submissions").insert({
      nomination_id: activeNomination.id,
      category,
      submitter_name: submitterName,
      submitter_email: submitterEmail,
      submitter_phone: submitterPhone,
      payload,
    });

    if (!error) {
      await sendSubmissionNotificationEmail({
        submitterEmail,
        category,
        nominationId: activeNomination.id,
        submittedAt: new Date().toISOString(),
        payload,
      });
      revalidatePath("/nominations");
      redirect("/nominations?success=1");
    }
    redirect("/nominations");
  }

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="rounded-lg bg-white p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">{copy.title}</h1>
          <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
            {NOMINATION_CATEGORY_LABELS[activeNomination.category]}
          </p>
          {copy.body_markdown && (
            <div className="mt-3">
              <Markdown content={copy.body_markdown} />
            </div>
          )}
        </header>

        {searchParams.success ? (
          <p className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {copy.success_message || "Thank You For Nominating"}
          </p>
        ) : (
          <form action={submitNomination} className="grid gap-3 md:grid-cols-2">
            <input
              name="submitter_name"
              placeholder="Submitter's Name"
              required
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="submitter_email"
              type="email"
              placeholder="Submitter's Email"
              required
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="submitter_phone"
              placeholder="Submitter's Phone"
              required
              className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
            />

            <input
              name="website"
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden="true"
            />

            {activeNomination.category === "athletes" && (
              <>
                <input
                  name="athlete_name"
                  placeholder="Athlete's Name"
                  required
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <select
                  name="boy_or_girl"
                  required
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                >
                  <option value="">Boy or Girl</option>
                  <option value="boy">Boy</option>
                  <option value="girl">Girl</option>
                </select>
                <input
                  name="grade"
                  placeholder="Grade"
                  required
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <input
                  name="sport"
                  placeholder="Sport"
                  required
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <textarea
                  name="why_nominate"
                  required
                  placeholder="Why are you nominating this person for Athletes of the Month?"
                  className="min-h-[110px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
                />
                <textarea
                  name="parent_guardian_contact"
                  required
                  placeholder="How could we get in touch with this athlete's parent/guardian for consent to interview?"
                  className="min-h-[110px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
                />
              </>
            )}

            {activeNomination.category === "teachers" && (
              <>
                <input
                  name="teacher_name"
                  placeholder="Teacher's Name"
                  required
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <input
                  name="grade_or_subject"
                  placeholder="Grade or Subject"
                  required
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <select
                  name="campus"
                  required
                  className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
                >
                  <option value="">Campus</option>
                  <option value="LPC Elementary">LPC Elementary</option>
                  <option value="DG Elementary">DG Elementary</option>
                  <option value="UMS">UMS</option>
                  <option value="UHS">UHS</option>
                </select>
                <textarea
                  name="why_nominate"
                  required
                  placeholder="Why are you nominating this teacher for Teachers of the Month?"
                  className="min-h-[110px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
                />
              </>
            )}

            {activeNomination.category === "leaders" && (
              <>
                <input
                  name="leader_name"
                  placeholder="Leader's Name"
                  required
                  className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
                />
                <input
                  name="leader_phone"
                  placeholder="Leader's Phone (optional)"
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <input
                  name="leader_email"
                  type="email"
                  placeholder="Leader's Email (optional)"
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <textarea
                  name="why_nominate"
                  required
                  placeholder="Why are you nominating this person for Local Leader of the Month?"
                  className="min-h-[110px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
                />
              </>
            )}

            {activeNomination.category === "workforce" && (
              <>
                <input
                  name="worker_name"
                  placeholder="Worker's Name"
                  required
                  className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
                />
                <input
                  name="worker_phone"
                  placeholder="Worker's Phone (optional)"
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <input
                  name="worker_email"
                  type="email"
                  placeholder="Worker's Email (optional)"
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <textarea
                  name="why_nominate"
                  required
                  placeholder="Why are you nominating this person for Workforce Star of the Month?"
                  className="min-h-[110px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
                />
              </>
            )}

            <button
              type="submit"
              className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white md:col-span-2"
            >
              {copy.submit_button_text || "Submit Nomination"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
