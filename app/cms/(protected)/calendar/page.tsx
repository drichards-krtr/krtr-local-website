import { createServerSupabase } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import ImageUploadField from "@/components/shared/ImageUploadField";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function formatDateOnly(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { search?: string; status?: string };
}) {
  const supabase = createServerSupabase();
  const search = searchParams.search?.trim() || "";
  const status = searchParams.status || "all";

  let query = supabase
    .from("events")
    .select("id, title, location, start_at, status, image_url")
    .order("start_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const { data: events } = await query;

  async function addEvent(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const title = String(formData.get("title") || "");
    const description = String(formData.get("description") || "");
    const location = String(formData.get("location") || "");
    const startAt = String(formData.get("start_at") || "");
    const endAt = String(formData.get("end_at") || "");
    const imageUrl = String(formData.get("image_url") || "") || null;
    const statusValue = String(formData.get("status") || "published");

    const recurrence = String(formData.get("recurrence") || "none");
    const recurrenceEndDate = String(formData.get("recurrence_end_date") || "");
    const recurrenceDays = formData
      .getAll("recurrence_days")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

    if (recurrence !== "weekly") {
      await supabase.from("events").insert({
        title,
        description,
        location,
        start_at: startAt,
        end_at: endAt || "",
        image_url: imageUrl,
        status: statusValue,
      });
    } else {
      const startDate = startAt.slice(0, 10);
      const startTime = startAt.slice(11, 16);
      const endTime = endAt ? endAt.slice(11, 16) : null;

      const startDateObj = new Date(`${startDate}T00:00:00`);
      const endDateObj = new Date(
        `${(recurrenceEndDate || startDate).slice(0, 10)}T00:00:00`
      );
      const defaultDay = new Date(`${startDate}T00:00:00`).getDay();
      const selectedDays = recurrenceDays.length ? recurrenceDays : [defaultDay];

      const rows: Array<{
        title: string;
        description: string;
        location: string;
        start_at: string;
        end_at: string | null;
        image_url: string | null;
        status: string;
      }> = [];

      for (
        let cursor = new Date(startDateObj);
        cursor <= endDateObj;
        cursor.setDate(cursor.getDate() + 1)
      ) {
        if (!selectedDays.includes(cursor.getDay())) continue;
        const dayText = formatDateOnly(cursor);
        rows.push({
          title,
          description,
          location,
          start_at: `${dayText}T${startTime}`,
          end_at: endTime ? `${dayText}T${endTime}` : null,
          image_url: imageUrl,
          status: statusValue,
        });
      }

      if (rows.length > 0) {
        await supabase.from("events").insert(rows);
      }
    }
    revalidatePath("/cms/calendar");
    revalidatePath("/calendar");
    redirect("/cms/calendar");
  }

  async function unpublishEvent(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const id = String(formData.get("id"));
    await supabase.from("events").update({ status: "archived" }).eq("id", id);
    revalidatePath("/cms/calendar");
    revalidatePath("/calendar");
    redirect("/cms/calendar");
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="text-sm text-neutral-500">Manage community events.</p>
      </header>

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <input
          name="search"
          placeholder="Search events"
          defaultValue={search}
          className="w-64 rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">All status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Apply
        </button>
      </form>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">New Event</h2>
        <form action={addEvent} className="grid gap-3 md:grid-cols-2">
          <input
            name="title"
            placeholder="Title"
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
          <select
            name="status"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <select
            name="recurrence"
            defaultValue="none"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="none">Does not repeat</option>
            <option value="weekly">Repeats weekly</option>
          </select>
          <input
            name="recurrence_end_date"
            type="date"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="md:col-span-2">
            <p className="mb-2 text-xs text-neutral-500">
              Recurrence days (used when "Repeats weekly" is selected, bro.)
            </p>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map((day) => (
                <label key={day.value} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="recurrence_days" value={day.value} />
                  {day.label}
                </label>
              ))}
            </div>
          </div>
          <textarea
            name="description"
            placeholder="Description"
            className="min-h-[80px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
          />
          <div className="md:col-span-2">
            <ImageUploadField name="image_url" label="Event Image" folder="krtr/events" />
          </div>
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white md:col-span-2"
          >
            Save Event
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Title</div>
          <div>Location</div>
          <div>Date</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {(events || []).map((event) => (
          <div
            key={event.id}
            className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
          >
            <div>{event.title}</div>
            <div className="text-neutral-500">{event.location || "-"}</div>
            <div className="text-neutral-500">
              {new Date(event.start_at).toLocaleDateString()}
            </div>
            <div className="capitalize">{event.status}</div>
            <div className="flex gap-3">
              <a href={`/cms/calendar/${event.id}`} className="text-sm underline">
                Edit
              </a>
              <form action={unpublishEvent}>
                <input type="hidden" name="id" value={event.id} />
                <button type="submit" className="text-sm underline">
                  Unpublish
                </button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
