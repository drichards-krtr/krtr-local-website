import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import ImageUploadField from "@/components/shared/ImageUploadField";

async function sendSubmissionNotificationEmail() {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return;

  const from = process.env.EVENT_SUBMISSION_EMAIL_FROM || "onboarding@resend.dev";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: ["hello@krtrlocal.tv"],
      subject: "New Community Calendar submission",
      text: "There is a new submission to review for the Community Calendar.",
    }),
  }).catch(() => {});
}

export default function SubmitCalendarEventPage() {
  async function submitEvent(formData: FormData) {
    "use server";

    const service = createServiceClient();
    const submitterName = String(formData.get("submitter_name") || "").trim();
    const submitterPhone = String(formData.get("submitter_phone") || "").trim();
    const submitterEmail = String(formData.get("submitter_email") || "").trim();

    const { data: submitter, error: submitterError } = await service
      .from("event_submitters")
      .insert({
        name: submitterName,
        phone: submitterPhone,
        email: submitterEmail,
      })
      .select("id")
      .single();

    if (submitterError) {
      throw new Error(`Unable to save submitter contact: ${submitterError.message}`);
    }

    const { error: eventError } = await service.from("events").insert({
      title: String(formData.get("title") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      location: String(formData.get("location") || "").trim() || null,
      start_at: String(formData.get("start_at") || ""),
      end_at: String(formData.get("end_at") || "").trim() || null,
      image_url: String(formData.get("image_url") || "").trim() || null,
      status: "draft",
      submitter_id: submitter.id,
    });

    if (eventError) {
      throw new Error(`Unable to save event submission: ${eventError.message}`);
    }

    await sendSubmissionNotificationEmail();
    redirect("/calendar/submit/thanks");
  }

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="rounded-lg bg-white p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Submit Community Calendar Event</h1>
          <p className="text-sm text-neutral-600">
            Submit your event for review. Submissions are saved as draft until approved.
          </p>
        </header>

        <form action={submitEvent} className="grid gap-3 md:grid-cols-2">
          <input
            name="title"
            placeholder="Event title"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="location"
            placeholder="Location"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="start_at"
            type="datetime-local"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="end_at"
            type="datetime-local"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <textarea
            name="description"
            placeholder="Description"
            className="min-h-[100px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
          />
          <div className="rounded border border-neutral-200 bg-neutral-50 p-3 md:col-span-2">
            <h2 className="text-sm font-semibold">Contact Information</h2>
            <p className="mb-3 text-xs text-neutral-600">
              This is used if we need questions answered before publishing.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <input
                name="submitter_name"
                placeholder="Your name"
                required
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="submitter_phone"
                placeholder="Phone"
                required
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="submitter_email"
                type="email"
                placeholder="Email"
                required
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <ImageUploadField name="image_url" label="Event Image" folder="krtr/events" />
          </div>
          <div className="md:col-span-2">
            <p className="mb-2 text-xs text-neutral-600">
              Submission status is automatically set to draft for review.
            </p>
            <button
              type="submit"
              className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Submit Event
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
