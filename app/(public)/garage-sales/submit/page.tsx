import { redirect } from "next/navigation";
import ImageUploadField from "@/components/shared/ImageUploadField";
import { getCurrentDistrict } from "@/lib/districtServer";
import { createServiceClient } from "@/lib/supabase/admin";
import { getOpenGarageSaleSessions } from "@/lib/garage-sales";
import { getDateTextInTimeZone } from "@/lib/dates";

const fieldClassName =
  "min-w-0 w-full max-w-full rounded border border-neutral-300 px-3 py-2 text-sm";

function getSessionDateOptions(openDate: string, closeDate: string) {
  const dates = [];
  const current = new Date(`${openDate}T00:00:00Z`);
  const end = new Date(`${closeDate}T00:00:00Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function formatSessionDate(dateText: string) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatSaleTime(timeText: string) {
  const [hourText, minuteText] = timeText.split(":");
  const date = new Date(Date.UTC(2026, 0, 1, Number(hourText || "0"), Number(minuteText || "0")));

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

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
      text: `There is a new published garage sale submission for ${sessionName}.`,
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
      .select("id, district_key, name, slug, status, open_date, close_date, sale_start_date, sale_end_date, map_enabled")
      .eq("id", sessionId)
      .eq("district_key", district.key)
      .eq("status", "active")
      .lte("open_date", today)
      .gte("close_date", today)
      .maybeSingle();

    if (sessionError || !session) {
      throw new Error("Unable to find an open garage sale session for this submission.");
    }

    const submitterName = String(formData.get("submitter_name") || "").trim();
    const submitterPhone = String(formData.get("submitter_phone") || "").trim();
    const submitterEmail = String(formData.get("submitter_email") || "").trim();
    const selectedDates = formData
      .getAll("sale_date")
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (!submitterName || !submitterPhone || !submitterEmail) {
      throw new Error("Name, phone number, and email are required for garage sale submissions.");
    }

    if (selectedDates.length === 0) {
      throw new Error("Select at least one sale date.");
    }

    const saleDateRows = selectedDates.map((saleDate) => {
      const startTime = String(formData.get(`start_time_${saleDate}`) || "").trim();
      const endTime = String(formData.get(`end_time_${saleDate}`) || "").trim();

      if (!startTime || !endTime) {
        throw new Error("Start and end times are required for each selected sale date.");
      }

      return {
        sale_date: saleDate,
        start_time: startTime,
        end_time: endTime,
      };
    });
    const dateTimeNotes = String(formData.get("date_time_notes") || "").trim();
    const dateTimes = [
      ...saleDateRows.map(
        (entry) =>
          `${formatSessionDate(entry.sale_date)}: ${formatSaleTime(entry.start_time)} - ${formatSaleTime(entry.end_time)}`
      ),
      dateTimeNotes,
    ]
      .filter(Boolean)
      .join("\n");

    const { data: submission, error: submissionError } = await service
      .from("garage_sale_submissions")
      .insert({
      session_id: session.id,
      district_key: district.key,
      address: String(formData.get("address") || "").trim(),
      date_times: dateTimes,
      items: String(formData.get("items") || "").trim(),
      image_url: String(formData.get("image_url") || "").trim() || null,
      submitter_name: submitterName,
      submitter_phone: submitterPhone,
      submitter_email: submitterEmail,
      status: "published",
      geocode_status: session.map_enabled ? "pending" : "skipped",
    })
      .select("id")
      .single();

    if (submissionError) {
      throw new Error(`Unable to save garage sale submission: ${submissionError.message}`);
    }

    const { error: saleDateError } = await service.from("garage_sale_submission_dates").insert(
      saleDateRows.map((row) => ({
        ...row,
        submission_id: submission.id,
      }))
    );

    if (saleDateError) {
      await service.from("garage_sale_submissions").delete().eq("id", submission.id);
      throw new Error(`Unable to save garage sale dates: ${saleDateError.message}`);
    }

    await sendGarageSaleSubmissionEmail(submitterEmail, district.name, session.name);
    redirect("/garage-sales/submit/thanks");
  }

  const sessionDateOptions = selectedSession
    ? getSessionDateOptions(selectedSession.sale_start_date, selectedSession.sale_end_date)
    : [];

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="overflow-hidden rounded-lg bg-white p-4 sm:p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Submit Garage Sale</h1>
          <p className="text-sm text-neutral-600">
            Submit your sale to be published on the garage sales page.
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
            <div className="grid gap-3 rounded border border-neutral-200 bg-neutral-50 p-3 md:col-span-2">
              <h2 className="text-sm font-semibold">Sale Dates and Times</h2>
              <div className="grid gap-3">
                {sessionDateOptions.map((dateText) => (
                  <div
                    key={dateText}
                    className="grid gap-2 rounded border border-neutral-200 bg-white p-3 md:grid-cols-[1fr_160px_160px]"
                  >
                    <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                      <input name="sale_date" type="checkbox" value={dateText} />
                      <span>{formatSessionDate(dateText)}</span>
                    </label>
                    <label className="grid gap-1 text-xs font-medium uppercase text-neutral-500">
                      <span>Start</span>
                      <input
                        name={`start_time_${dateText}`}
                        type="time"
                        defaultValue="08:00"
                        className={fieldClassName}
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium uppercase text-neutral-500">
                      <span>End</span>
                      <input
                        name={`end_time_${dateText}`}
                        type="time"
                        defaultValue="16:00"
                        className={fieldClassName}
                      />
                    </label>
                  </div>
                ))}
              </div>
              <textarea
                name="date_time_notes"
                placeholder="Optional date/time notes"
                className={`min-h-[80px] ${fieldClassName}`}
              />
            </div>
            <textarea
              name="items"
              placeholder="Items in Sale - tools, clothing, dishes, toys, books"
              required
              className={`min-h-[120px] ${fieldClassName} md:col-span-2`}
            />
            <div className="min-w-0 rounded border border-neutral-200 bg-neutral-50 p-3 md:col-span-2">
              <h2 className="text-sm font-semibold">Contact Information</h2>
              <p className="mb-3 text-xs text-neutral-600">
                Name, email and phone number are not published publicly and are only used in case there is an issue with your submission.
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
