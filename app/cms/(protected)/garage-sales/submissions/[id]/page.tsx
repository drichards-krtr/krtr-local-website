import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import CloudinaryMediaLibraryField from "@/components/cms/CloudinaryMediaLibraryField";
import { createServerSupabase } from "@/lib/supabase/server";
import { DISTRICT_OPTIONS, parseDistrictKey } from "@/lib/districts";

type SubmissionDateRow = {
  sale_date: string;
  start_time: string;
  end_time: string;
};

type SessionRow = {
  id: string;
  name: string;
  district_key: string;
  open_date: string;
  close_date: string;
  sale_start_date: string;
  sale_end_date: string;
};

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

function formatSaleDate(dateText: string) {
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

export default async function EditGarageSaleSubmissionPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { district?: string; status?: string };
}) {
  const supabase = createServerSupabase();
  const districtKey = parseDistrictKey(searchParams?.district) || "dlpc";
  const statusFilter = searchParams?.status || "draft";

  const [{ data: submission }, { data: sessions }, { data: submissionDates }] = await Promise.all([
    supabase
      .from("garage_sale_submissions")
      .select(
        "id, session_id, district_key, address, date_times, items, image_url, submitter_name, submitter_phone, submitter_email, status, latitude, longitude, geocode_status, geocode_error, geocode_place_id, geocoded_address, geocoded_at"
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("garage_sale_sessions")
      .select("id, name, district_key, open_date, close_date, sale_start_date, sale_end_date")
      .eq("district_key", districtKey)
      .order("open_date", { ascending: false }),
    supabase
      .from("garage_sale_submission_dates")
      .select("sale_date, start_time, end_time")
      .eq("submission_id", params.id)
      .order("sale_date", { ascending: true }),
  ]);

  if (!submission) {
    return <p>Garage sale submission not found.</p>;
  }

  async function updateSubmission(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const selectedDates = formData
      .getAll("sale_date")
      .map((value) => String(value || "").trim())
      .filter(Boolean);
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
          `${formatSaleDate(entry.sale_date)}: ${formatSaleTime(entry.start_time)} - ${formatSaleTime(entry.end_time)}`
      ),
      dateTimeNotes,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await supabase
      .from("garage_sale_submissions")
      .update({
        district_key: nextDistrictKey,
        session_id: String(formData.get("session_id") || ""),
        address: String(formData.get("address") || "").trim(),
        date_times: dateTimes || String(formData.get("date_times") || "").trim(),
        items: String(formData.get("items") || "").trim(),
        image_url: String(formData.get("image_url") || "").trim() || null,
        submitter_name: String(formData.get("submitter_name") || "").trim(),
        submitter_phone: String(formData.get("submitter_phone") || "").trim(),
        submitter_email: String(formData.get("submitter_email") || "").trim(),
        status: String(formData.get("status") || "draft"),
        latitude: String(formData.get("latitude") || "").trim() || null,
        longitude: String(formData.get("longitude") || "").trim() || null,
        geocode_status: String(formData.get("geocode_status") || "skipped"),
        geocode_error: String(formData.get("geocode_error") || "").trim() || null,
        geocode_place_id: String(formData.get("geocode_place_id") || "").trim() || null,
        geocoded_address: String(formData.get("geocoded_address") || "").trim() || null,
      })
      .eq("id", params.id);

    if (result.error) {
      throw new Error(`Unable to update garage sale submission: ${result.error.message}`);
    }

    const deleteDatesResult = await supabase
      .from("garage_sale_submission_dates")
      .delete()
      .eq("submission_id", params.id);

    if (deleteDatesResult.error) {
      throw new Error(`Unable to update garage sale dates: ${deleteDatesResult.error.message}`);
    }

    if (saleDateRows.length > 0) {
      const datesResult = await supabase.from("garage_sale_submission_dates").insert(
        saleDateRows.map((row) => ({
          ...row,
          submission_id: params.id,
        }))
      );

      if (datesResult.error) {
        throw new Error(`Unable to update garage sale dates: ${datesResult.error.message}`);
      }
    }

    revalidatePath("/garage-sales");
    revalidatePath("/cms/garage-sales");
    redirect(`/cms/garage-sales?district=${nextDistrictKey}&status=${statusFilter}`);
  }

  const sessionRows = (sessions || []) as SessionRow[];
  const dateRows = (submissionDates || []) as SubmissionDateRow[];
  const datesByDate = new Map(dateRows.map((row) => [row.sale_date, row]));
  const selectedSession = sessionRows.find((session) => session.id === submission.session_id) || sessionRows[0] || null;
  const sessionDateOptions = selectedSession
    ? getSessionDateOptions(selectedSession.sale_start_date, selectedSession.sale_end_date)
    : dateRows.map((row) => row.sale_date);

  return (
    <div className="grid gap-6">
      <header>
        <a href={`/cms/garage-sales?district=${districtKey}&status=${statusFilter}`} className="text-sm underline">
          Back to Garage Sales
        </a>
        <h1 className="mt-2 text-2xl font-semibold">Review Garage Sale Submission</h1>
        <p className="text-sm text-neutral-500">Edit listing details and publish when ready.</p>
      </header>

      <form action={updateSubmission} className="grid gap-3 rounded border border-neutral-200 bg-white p-6 md:grid-cols-2">
        <select
          name="district_key"
          defaultValue={submission.district_key}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {DISTRICT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          name="session_id"
          defaultValue={submission.session_id}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {sessionRows.map((session) => (
            <option key={session.id} value={session.id}>
              {session.name}
            </option>
          ))}
        </select>
        <input
          name="address"
          defaultValue={submission.address}
          required
          className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
        />
        <div className="grid gap-3 rounded border border-neutral-200 bg-neutral-50 p-3 md:col-span-2">
          <h2 className="text-sm font-semibold">Sale Dates and Times</h2>
          <div className="grid gap-3">
            {sessionDateOptions.map((dateText) => {
              const existingDate = datesByDate.get(dateText);

              return (
                <div
                  key={dateText}
                  className="grid gap-2 rounded border border-neutral-200 bg-white p-3 md:grid-cols-[1fr_160px_160px]"
                >
                  <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                    <input
                      name="sale_date"
                      type="checkbox"
                      value={dateText}
                      defaultChecked={Boolean(existingDate)}
                    />
                    <span>{formatSaleDate(dateText)}</span>
                  </label>
                  <label className="grid gap-1 text-xs font-medium uppercase text-neutral-500">
                    <span>Start</span>
                    <input
                      name={`start_time_${dateText}`}
                      type="time"
                      defaultValue={existingDate?.start_time?.slice(0, 5) || "08:00"}
                      className="rounded border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium uppercase text-neutral-500">
                    <span>End</span>
                    <input
                      name={`end_time_${dateText}`}
                      type="time"
                      defaultValue={existingDate?.end_time?.slice(0, 5) || "16:00"}
                      className="rounded border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              );
            })}
          </div>
          <textarea
            name="date_time_notes"
            placeholder="Optional date/time notes"
            className="min-h-[80px] rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input type="hidden" name="date_times" value={submission.date_times || ""} />
        </div>
        <textarea
          name="items"
          defaultValue={submission.items}
          required
          className="min-h-[120px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
        />
        <select
          name="status"
          defaultValue={submission.status}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <div />
        <div className="rounded border border-neutral-200 bg-neutral-50 p-3 md:col-span-2">
          <h2 className="text-sm font-semibold">Map Geocoding</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <select
              name="geocode_status"
              defaultValue={submission.geocode_status}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="pending">Pending</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
            <input
              name="latitude"
              defaultValue={submission.latitude || ""}
              placeholder="Latitude"
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="longitude"
              defaultValue={submission.longitude || ""}
              placeholder="Longitude"
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="geocode_place_id"
              defaultValue={submission.geocode_place_id || ""}
              placeholder="Google place ID"
              className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-3"
            />
            <input
              name="geocoded_address"
              defaultValue={submission.geocoded_address || ""}
              placeholder="Geocoded address"
              className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-3"
            />
            <textarea
              name="geocode_error"
              defaultValue={submission.geocode_error || ""}
              placeholder="Geocode error"
              className="min-h-[80px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-3"
            />
          </div>
          {submission.geocoded_at && (
            <p className="mt-2 text-xs text-neutral-500">Last geocoded: {submission.geocoded_at}</p>
          )}
        </div>
        <div className="rounded border border-neutral-200 bg-neutral-50 p-3 md:col-span-2">
          <h2 className="text-sm font-semibold">Submitter Contact</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <input
              name="submitter_name"
              defaultValue={submission.submitter_name}
              required
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="submitter_phone"
              defaultValue={submission.submitter_phone}
              required
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="submitter_email"
              type="email"
              defaultValue={submission.submitter_email}
              required
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="md:col-span-2">
          <CloudinaryMediaLibraryField
            name="image_url"
            label="Optional Image"
            folder="krtr/garage-sales"
            initialUrl={submission.image_url || ""}
          />
        </div>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white md:col-span-2"
        >
          Save Submission
        </button>
      </form>
    </div>
  );
}
