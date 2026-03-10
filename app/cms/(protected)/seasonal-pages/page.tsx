import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import ImageUploadField from "@/components/shared/ImageUploadField";
import VideoUploadField from "@/components/shared/VideoUploadField";
import { createServerSupabase } from "@/lib/supabase/server";

type SeasonalPage = {
  slug: "vote" | "festival-of-trails";
  nav_label: string;
  nav_enabled: boolean;
};

type VoteJurisdiction = {
  slug: string;
  label: string;
  seats_open: number;
  sort_order: number;
};

type VoteSeat = {
  id: string;
  jurisdiction_slug: string;
  seat_key: string;
  seat_name: string;
  term_years: number | null;
  sort_order: number;
};

type VoteCandidate = {
  id: string;
  jurisdiction_slug: string;
  seat_id: string | null;
  candidate_name: string;
  photo_url: string | null;
  link_1_url: string | null;
  link_1_text: string | null;
  link_2_url: string | null;
  link_2_text: string | null;
  sort_order: number;
};

type FestivalContent = {
  id: number;
  body_markdown: string;
  photo_url: string | null;
  photo_active: boolean;
  video_url: string | null;
  video_active: boolean;
};

type FestivalLink = {
  id: string;
  link_text: string;
  link_url: string;
  priority: number;
};

function toInt(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function SeasonalPagesCms({
  searchParams,
}: {
  searchParams: { error?: string; success?: string };
}) {
  const supabase = createServerSupabase();

  const [
    { data: seasonalPagesData },
    { data: jurisdictionsData },
    { data: seatsData },
    { data: candidatesData },
    { data: festivalContentData },
    { data: festivalLinksData },
  ] = await Promise.all([
    supabase
      .from("seasonal_pages")
      .select("slug, nav_label, nav_enabled")
      .order("slug", { ascending: true }),
    supabase
      .from("vote_jurisdictions")
      .select("slug, label, seats_open, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("vote_seats")
      .select("id, jurisdiction_slug, seat_key, seat_name, term_years, sort_order")
      .order("jurisdiction_slug", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("seat_key", { ascending: true }),
    supabase
      .from("vote_candidates")
      .select(
        "id, jurisdiction_slug, seat_id, candidate_name, photo_url, link_1_url, link_1_text, link_2_url, link_2_text, sort_order"
      )
      .order("jurisdiction_slug", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("candidate_name", { ascending: true }),
    supabase
      .from("festival_of_trails_content")
      .select("id, body_markdown, photo_url, photo_active, video_url, video_active")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("festival_of_trails_links")
      .select("id, link_text, link_url, priority")
      .order("priority", { ascending: true }),
  ]);

  const seasonalPages = (seasonalPagesData || []) as SeasonalPage[];
  const jurisdictions = (jurisdictionsData || []) as VoteJurisdiction[];
  const seats = (seatsData || []) as VoteSeat[];
  const candidates = (candidatesData || []) as VoteCandidate[];
  const festivalContent = (festivalContentData as FestivalContent | null) || {
    id: 1,
    body_markdown: "",
    photo_url: null,
    photo_active: false,
    video_url: null,
    video_active: false,
  };
  const festivalLinks = (festivalLinksData || []) as FestivalLink[];
  const priorityOptions = Array.from(
    { length: Math.max(100, festivalLinks.length + 20) },
    (_, index) => index + 1
  );

  const seatMap = new Map(seats.map((seat) => [seat.id, seat]));
  const seatOptions = seats.map((seat) => ({
    id: seat.id,
    label: `${jurisdictions.find((j) => j.slug === seat.jurisdiction_slug)?.label || seat.jurisdiction_slug} - ${seat.seat_key}${seat.seat_name ? ` (${seat.seat_name})` : ""}`,
  }));

  async function refreshAndReturn(path = "/cms/seasonal-pages", success = "saved") {
    revalidatePath("/", "layout");
    revalidatePath("/vote");
    revalidatePath("/festival-of-trails");
    revalidatePath("/cms/seasonal-pages");
    redirect(`${path}?success=${encodeURIComponent(success)}`);
  }

  async function saveNav(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const payload = ["vote", "festival-of-trails"].map((slug) => ({
      slug,
      nav_enabled: formData.get(`nav_${slug}`) === "on",
    }));
    const { error } = await service.from("seasonal_pages").upsert(payload, {
      onConflict: "slug",
    });
    if (error) {
      redirect(`/cms/seasonal-pages?error=${encodeURIComponent(error.message)}`);
    }
    await refreshAndReturn("/cms/seasonal-pages", "nav");
  }

  async function saveSeatCounts(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    for (const jurisdiction of jurisdictions) {
      const seatsOpen = Math.max(0, toInt(formData.get(`seats_open_${jurisdiction.slug}`), 0));
      const { error } = await service
        .from("vote_jurisdictions")
        .update({ seats_open: seatsOpen })
        .eq("slug", jurisdiction.slug);
      if (error) {
        redirect(`/cms/seasonal-pages?error=${encodeURIComponent(error.message)}`);
      }
    }
    await refreshAndReturn("/cms/seasonal-pages", "seat-counts");
  }

  async function addSeat(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const payload = {
      jurisdiction_slug: String(formData.get("jurisdiction_slug") || ""),
      seat_key: String(formData.get("seat_key") || "").trim(),
      seat_name: String(formData.get("seat_name") || "").trim(),
      term_years: toInt(formData.get("term_years"), 0) || null,
      sort_order: Math.max(1, toInt(formData.get("sort_order"), 1)),
    };
    const { error } = await service.from("vote_seats").insert(payload);
    if (error) {
      redirect(`/cms/seasonal-pages?error=${encodeURIComponent(error.message)}`);
    }
    await refreshAndReturn("/cms/seasonal-pages", "seat-added");
  }

  async function updateSeat(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id") || "");
    const payload = {
      seat_key: String(formData.get("seat_key") || "").trim(),
      seat_name: String(formData.get("seat_name") || "").trim(),
      term_years: toInt(formData.get("term_years"), 0) || null,
      sort_order: Math.max(1, toInt(formData.get("sort_order"), 1)),
    };
    const { error } = await service.from("vote_seats").update(payload).eq("id", id);
    if (error) {
      redirect(`/cms/seasonal-pages?error=${encodeURIComponent(error.message)}`);
    }
    await refreshAndReturn("/cms/seasonal-pages", "seat-updated");
  }

  async function deleteSeat(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id") || "");
    const { error } = await service.from("vote_seats").delete().eq("id", id);
    if (error) {
      redirect(`/cms/seasonal-pages?error=${encodeURIComponent(error.message)}`);
    }
    await refreshAndReturn("/cms/seasonal-pages", "seat-deleted");
  }

  async function addCandidate(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const seatValue = String(formData.get("seat_id") || "").trim();
    const payload = {
      jurisdiction_slug: String(formData.get("jurisdiction_slug") || ""),
      seat_id: seatValue || null,
      candidate_name: String(formData.get("candidate_name") || "").trim(),
      photo_url: String(formData.get("photo_url") || "").trim() || null,
      link_1_url: String(formData.get("link_1_url") || "").trim() || null,
      link_1_text: String(formData.get("link_1_text") || "").trim() || null,
      link_2_url: String(formData.get("link_2_url") || "").trim() || null,
      link_2_text: String(formData.get("link_2_text") || "").trim() || null,
      sort_order: Math.max(1, toInt(formData.get("sort_order"), 1)),
    };
    const { error } = await service.from("vote_candidates").insert(payload);
    if (error) {
      redirect(`/cms/seasonal-pages?error=${encodeURIComponent(error.message)}`);
    }
    await refreshAndReturn("/cms/seasonal-pages", "candidate-added");
  }

  async function updateCandidate(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id") || "");
    const seatValue = String(formData.get("seat_id") || "").trim();
    const payload = {
      jurisdiction_slug: String(formData.get("jurisdiction_slug") || ""),
      seat_id: seatValue || null,
      candidate_name: String(formData.get("candidate_name") || "").trim(),
      photo_url: String(formData.get("photo_url") || "").trim() || null,
      link_1_url: String(formData.get("link_1_url") || "").trim() || null,
      link_1_text: String(formData.get("link_1_text") || "").trim() || null,
      link_2_url: String(formData.get("link_2_url") || "").trim() || null,
      link_2_text: String(formData.get("link_2_text") || "").trim() || null,
      sort_order: Math.max(1, toInt(formData.get("sort_order"), 1)),
    };
    const { error } = await service.from("vote_candidates").update(payload).eq("id", id);
    if (error) {
      redirect(`/cms/seasonal-pages?error=${encodeURIComponent(error.message)}`);
    }
    await refreshAndReturn("/cms/seasonal-pages", "candidate-updated");
  }

  async function deleteCandidate(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id") || "");
    const { error } = await service.from("vote_candidates").delete().eq("id", id);
    if (error) {
      redirect(`/cms/seasonal-pages?error=${encodeURIComponent(error.message)}`);
    }
    await refreshAndReturn("/cms/seasonal-pages", "candidate-deleted");
  }

  async function saveFestivalContent(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const payload = {
      id: 1,
      body_markdown: String(formData.get("body_markdown") || ""),
      photo_url: String(formData.get("photo_url") || "").trim() || null,
      photo_active: formData.get("photo_active") === "on",
      video_url: String(formData.get("video_url") || "").trim() || null,
      video_active: formData.get("video_active") === "on",
    };
    const { error } = await service
      .from("festival_of_trails_content")
      .upsert(payload, { onConflict: "id" });
    if (error) {
      redirect(`/cms/seasonal-pages?error=${encodeURIComponent(error.message)}`);
    }
    await refreshAndReturn("/cms/seasonal-pages", "festival-content");
  }

  async function addFestivalLink(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const priority = Math.max(1, toInt(formData.get("priority"), 1));
    const { data: existing } = await service
      .from("festival_of_trails_links")
      .select("id")
      .eq("priority", priority)
      .maybeSingle();
    if (existing) {
      redirect("/cms/seasonal-pages?error=Priority already in use.");
    }
    const payload = {
      link_text: String(formData.get("link_text") || "").trim(),
      link_url: String(formData.get("link_url") || "").trim(),
      priority,
    };
    const { error } = await service.from("festival_of_trails_links").insert(payload);
    if (error) {
      redirect(`/cms/seasonal-pages?error=${encodeURIComponent(error.message)}`);
    }
    await refreshAndReturn("/cms/seasonal-pages", "festival-link-added");
  }

  async function updateFestivalLink(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id") || "");
    const priority = Math.max(1, toInt(formData.get("priority"), 1));
    const { data: existing } = await service
      .from("festival_of_trails_links")
      .select("id")
      .eq("priority", priority)
      .neq("id", id)
      .maybeSingle();
    if (existing) {
      redirect("/cms/seasonal-pages?error=Priority already in use.");
    }
    const payload = {
      link_text: String(formData.get("link_text") || "").trim(),
      link_url: String(formData.get("link_url") || "").trim(),
      priority,
    };
    const { error } = await service.from("festival_of_trails_links").update(payload).eq("id", id);
    if (error) {
      redirect(`/cms/seasonal-pages?error=${encodeURIComponent(error.message)}`);
    }
    await refreshAndReturn("/cms/seasonal-pages", "festival-link-updated");
  }

  async function deleteFestivalLink(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id") || "");
    const { error } = await service.from("festival_of_trails_links").delete().eq("id", id);
    if (error) {
      redirect(`/cms/seasonal-pages?error=${encodeURIComponent(error.message)}`);
    }
    await refreshAndReturn("/cms/seasonal-pages", "festival-link-deleted");
  }

  return (
    <div className="grid gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Seasonal Pages</h1>
        <p className="text-sm text-neutral-500">
          Manage VOTE and Festival of Trails pages and navigation visibility.
        </p>
      </header>

      {searchParams.error && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {searchParams.error}
        </p>
      )}
      {searchParams.success && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </p>
      )}

      <section className="rounded border border-neutral-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold">Main Nav Visibility</h2>
        <form action={saveNav} className="grid gap-4">
          {seasonalPages.map((page) => (
            <label key={page.slug} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`nav_${page.slug}`}
                defaultChecked={page.nav_enabled}
              />
              {page.nav_label}
            </label>
          ))}
          <button
            type="submit"
            className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Save Nav Settings
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold">VOTE Jurisdiction Seat Counts</h2>
        <form action={saveSeatCounts} className="grid gap-3 md:grid-cols-2">
          {jurisdictions.map((jurisdiction) => (
            <div key={jurisdiction.slug} className="grid gap-1">
              <label className="text-sm font-medium">{jurisdiction.label}</label>
              <input
                type="number"
                min="0"
                name={`seats_open_${jurisdiction.slug}`}
                defaultValue={jurisdiction.seats_open}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
          <button
            type="submit"
            className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white md:col-span-2"
          >
            Save Seat Counts
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold">VOTE Seat Definitions</h2>
        <form action={addSeat} className="mb-6 grid gap-3 md:grid-cols-4">
          <select
            name="jurisdiction_slug"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
            required
          >
            {jurisdictions.map((jurisdiction) => (
              <option key={jurisdiction.slug} value={jurisdiction.slug}>
                {jurisdiction.label}
              </option>
            ))}
          </select>
          <input
            name="seat_key"
            placeholder="Seat 1"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="seat_name"
            placeholder="Seat Name/Text"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="term_years"
            type="number"
            min="1"
            placeholder="Term Years"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="sort_order"
            type="number"
            min="1"
            defaultValue={1}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white md:col-span-3"
          >
            Add Seat
          </button>
        </form>

        <div className="grid gap-4">
          {seats.map((seat) => (
            <form
              key={seat.id}
              action={updateSeat}
              className="grid gap-3 rounded border border-neutral-200 p-4 md:grid-cols-6"
            >
              <input type="hidden" name="id" value={seat.id} />
              <div className="md:col-span-2">
                <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
                  {jurisdictions.find((j) => j.slug === seat.jurisdiction_slug)?.label}
                </p>
                <input
                  name="seat_key"
                  defaultValue={seat.seat_key}
                  className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <input
                name="seat_name"
                defaultValue={seat.seat_name}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="term_years"
                type="number"
                min="1"
                defaultValue={seat.term_years || ""}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="sort_order"
                type="number"
                min="1"
                defaultValue={seat.sort_order}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
                >
                  Save
                </button>
                <button
                  formAction={deleteSeat}
                  className="text-sm underline"
                  type="submit"
                >
                  Delete
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold">VOTE Candidates</h2>
        <form action={addCandidate} className="mb-6 grid gap-3 rounded border border-neutral-200 p-4 md:grid-cols-2">
          <select
            name="jurisdiction_slug"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
            required
          >
            {jurisdictions.map((jurisdiction) => (
              <option key={jurisdiction.slug} value={jurisdiction.slug}>
                {jurisdiction.label}
              </option>
            ))}
          </select>
          <select name="seat_id" className="rounded border border-neutral-300 px-3 py-2 text-sm">
            <option value="">No Seat Assignment</option>
            {seatOptions.map((seat) => (
              <option key={seat.id} value={seat.id}>
                {seat.label}
              </option>
            ))}
          </select>
          <input
            name="candidate_name"
            placeholder="Candidate Name"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="sort_order"
            type="number"
            min="1"
            defaultValue={1}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="md:col-span-2">
            <ImageUploadField name="photo_url" label="Candidate Photo" folder="krtr/vote" />
          </div>
          <input
            name="link_1_url"
            placeholder="Candidate Link 1 URL"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="link_1_text"
            placeholder="Candidate Link 1 Text"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="link_2_url"
            placeholder="Candidate Link 2 URL"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="link_2_text"
            placeholder="Candidate Link 2 Text"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white md:col-span-2"
          >
            Add Candidate
          </button>
        </form>

        <div className="grid gap-4">
          {candidates.map((candidate) => (
            <form
              key={candidate.id}
              action={updateCandidate}
              className="grid gap-3 rounded border border-neutral-200 p-4 md:grid-cols-2"
            >
              <input type="hidden" name="id" value={candidate.id} />
              <select
                name="jurisdiction_slug"
                defaultValue={candidate.jurisdiction_slug}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
                required
              >
                {jurisdictions.map((jurisdiction) => (
                  <option key={jurisdiction.slug} value={jurisdiction.slug}>
                    {jurisdiction.label}
                  </option>
                ))}
              </select>
              <select
                name="seat_id"
                defaultValue={candidate.seat_id || ""}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="">No Seat Assignment</option>
                {seatOptions.map((seat) => (
                  <option key={seat.id} value={seat.id}>
                    {seat.label}
                  </option>
                ))}
              </select>
              <input
                name="candidate_name"
                defaultValue={candidate.candidate_name}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="sort_order"
                type="number"
                min="1"
                defaultValue={candidate.sort_order}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <div className="md:col-span-2">
                <ImageUploadField
                  name="photo_url"
                  label="Candidate Photo"
                  folder="krtr/vote"
                  initialUrl={candidate.photo_url || ""}
                />
              </div>
              <input
                name="link_1_url"
                defaultValue={candidate.link_1_url || ""}
                placeholder="Candidate Link 1 URL"
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="link_1_text"
                defaultValue={candidate.link_1_text || ""}
                placeholder="Candidate Link 1 Text"
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="link_2_url"
                defaultValue={candidate.link_2_url || ""}
                placeholder="Candidate Link 2 URL"
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="link_2_text"
                defaultValue={candidate.link_2_text || ""}
                placeholder="Candidate Link 2 Text"
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-neutral-500 md:col-span-2">
                Seat:{" "}
                {candidate.seat_id
                  ? `${seatMap.get(candidate.seat_id)?.seat_key || "Unknown"}${seatMap.get(candidate.seat_id)?.term_years ? `, ${seatMap.get(candidate.seat_id)?.term_years} year term` : ""}`
                  : "Not assigned"}
              </p>
              <div className="flex items-center gap-3 md:col-span-2">
                <button
                  type="submit"
                  className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
                >
                  Save Candidate
                </button>
                <button
                  formAction={deleteCandidate}
                  type="submit"
                  className="text-sm underline"
                >
                  Delete
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold">Festival of Trails Content</h2>
        <form action={saveFestivalContent} className="grid gap-3">
          <label className="text-sm font-medium">Page Content (Markdown)</label>
          <textarea
            name="body_markdown"
            defaultValue={festivalContent.body_markdown || ""}
            className="min-h-[220px] rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <ImageUploadField
            name="photo_url"
            label="Festival Photo"
            folder="krtr/festival-of-trails"
            initialUrl={festivalContent.photo_url || ""}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="photo_active" defaultChecked={festivalContent.photo_active} />
            Photo Active
          </label>
          <VideoUploadField
            name="video_url"
            label="Festival Video"
            folder="krtr/festival-of-trails"
            initialUrl={festivalContent.video_url || ""}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="video_active" defaultChecked={festivalContent.video_active} />
            Video Active
          </label>
          <button
            type="submit"
            className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Save Festival Content
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold">Festival Links</h2>
        <form action={addFestivalLink} className="mb-6 grid gap-3 md:grid-cols-3">
          <input
            name="link_text"
            placeholder="Link Text"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="link_url"
            placeholder="Link URL"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <select
            name="priority"
            defaultValue={1}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            {priorityOptions.map((priority) => (
              <option key={priority} value={priority}>
                Priority {priority}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white md:col-span-3"
          >
            Add Link
          </button>
        </form>

        <div className="grid gap-4">
          {festivalLinks.map((link) => (
            <form
              key={link.id}
              action={updateFestivalLink}
              className="grid gap-3 rounded border border-neutral-200 p-4 md:grid-cols-4"
            >
              <input type="hidden" name="id" value={link.id} />
              <input
                name="link_text"
                defaultValue={link.link_text}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="link_url"
                defaultValue={link.link_url}
                className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
              />
              <select
                name="priority"
                defaultValue={link.priority}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                {priorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    Priority {priority}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-3 md:col-span-4">
                <button
                  type="submit"
                  className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
                >
                  Save Link
                </button>
                <button
                  type="submit"
                  formAction={deleteFestivalLink}
                  className="text-sm underline"
                >
                  Delete
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
