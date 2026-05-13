import { redirect } from "next/navigation";
import ImageUploadField from "@/components/shared/ImageUploadField";
import { getCurrentDistrict } from "@/lib/districtServer";
import { createServiceClient } from "@/lib/supabase/admin";
import { getOpenGarageSaleSessions } from "@/lib/garage-sales";
import { getDateTextInTimeZone } from "@/lib/dates";

const fieldClassName =
  "min-w-0 w-full max-w-full rounded border border-neutral-300 px-3 py-2 text-sm";

async function sendGarageSaleSubmissionEmail(
  submitterEmail: string,
  districtLabel: string,
  sessionName: string
) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn("[GarageSaleSubmission] RESEND_API_KEY missing; skipping email notification.");
    return;
  }

  const from =
    process.env.GARAGE_SALE_SUBMISSION_EMAIL_FROM ||
    process.env.EVENT_SUBMISSION_EMAIL_FROM ||
    "onboarding@resend.dev";
  const notifyTo =
    process.env.GARAGE_SALE_SUBMISSION_NOTIFY_TO ||
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
      subject: `New ${districtLabel} garage sale submission`,
      text: `There is a new garage sale submission to review for ${sessionName}.`,
    }),
  }).catch((error) => {
    console.error("[GarageSaleSubmission] Resend request failed", error);
    return null;
  });

  if (!response) return;
  if (!response.ok) {
    const detail = await response.text();
    console.error("[GarageSaleSubmission] Resend rejected email", {
      status: response.status,
      detail,
      from,
      to,
    });
  }
}

export default async function SubmitGarageSalePage({
  searchParams,
}: {
  searchParams?: { session?: string };
}) {
  const district = getCurrentDistrict();
  const sessions = await getOpenGarageSaleSessions(district.key);
  const selectedSession =
    sessions.find((session) => session.slug === searchParams?.session) || sessions[0] || null;

  async function submitGarageSale(formData: FormData) {
    "use server";

    const service = createServiceClient();
    const sessionId = String(formData.get("session_id") || "");
    const today = getDateTextInTimeZone();
    const { data: session, error: sessionError } = await service
      .from("garage_sale_sessions")
      .select("id, district_key, name, slug, status, open_date, close_date")
      .eq("id", sessionId)
      .eq("district_key", district.key)
      .eq("status", "active")
      .lte("open_date", today)
      .gte("close_date", today)
      .maybeSingle();

    if (sessionError || !session) {
      throw new Error("Unable to find an open garage sale session for this submission.");
    }

    const submitterEmail = String(formData.get("submitter_email") || "").trim();
    const { error: submissionError } = await service.from("garage_sale_submissions").insert({
      session_id: session.id,
      district_key: district.key,
      address: String(formData.get("address") || "").trim(),
      date_times: String(formData.get("date_times") || "").trim(),
      items: String(formData.get("items") || "").trim(),
      image_url: String(formData.get("image_url") || "").trim() || null,
      submitter_name: String(formData.get("submitter_name") || "").trim(),
      submitter_phone: String(formData.get("submitter_phone") || "").trim(),
      submitter_email: submitterEmail,
      status: "draft",
    });

    if (submissionError) {
      throw new Error(`Unable to save garage sale submission: ${submissionError.message}`);
    }

    await sendGarageSaleSubmissionEmail(submitterEmail, district.name, session.name);
    redirect("/garage-sales/submit/thanks");
  }

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="overflow-hidden rounded-lg bg-white p-4 sm:p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Submit Garage Sale</h1>
          <p className="text-sm text-neutral-600">
            Submit your sale for review. Submissions are saved as draft until approved.
          </p>
        </header>

        {!selectedSession ? (
          <p className="text-sm text-neutral-700">
            Garage sale submissions are not open right now.
          </p>
        ) : (
          <form action={submitGarageSale} className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
            {sessions.length > 1 ? (
              <label className="grid gap-1 text-sm font-medium text-neutral-700 md:col-span-2">
                <span>Garage sale session</span>
                <select
                  name="session_id"
                  defaultValue={selectedSession.id}
                  className={fieldClassName}
                >
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="session_id" value={selectedSession.id} />
            )}
            <input
              name="address"
              placeholder="Address"
              required
              className={`${fieldClassName} md:col-span-2`}
            />
            <textarea
              name="date_times"
              placeholder="Dates/times"
              required
              className={`min-h-[100px] ${fieldClassName} md:col-span-2`}
            />
            <textarea
              name="items"
              placeholder="Items in Sale - tools, clothing, dishes, toys, books"
              required
              className={`min-h-[120px] ${fieldClassName} md:col-span-2`}
            />
            <div className="min-w-0 rounded border border-neutral-200 bg-neutral-50 p-3 md:col-span-2">
              <h2 className="text-sm font-semibold">Contact Information</h2>
              <p className="mb-3 text-xs text-neutral-600">
                This is used if we need questions answered before publishing.
              </p>
              <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
                <input
                  name="submitter_name"
                  placeholder="Your name"
                  required
                  className={fieldClassName}
                />
                <input
                  name="submitter_phone"
                  placeholder="Phone"
                  required
                  className={fieldClassName}
                />
                <input
                  name="submitter_email"
                  type="email"
                  placeholder="Email"
                  required
                  className={fieldClassName}
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <ImageUploadField name="image_url" label="Optional Image" folder="krtr/garage-sales" />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Submit Sale
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
