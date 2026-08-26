import Link from "next/link";
import RichTextEditor from "./RichTextEditor";
import { COPY_STREAM_TYPES, STORY_LIFECYCLE_STATES, copyStreamLabel, type CopyStreamType } from "@/lib/stories";

type DistrictOption = {
  district_key: string;
  display_name: string;
};

type Story = {
  id: string;
  district_key: string;
  title: string;
  lifecycle_state: string;
  category_id: string | null;
};

type CopyStream = {
  id: string;
  stream_type: CopyStreamType;
  needs_review: boolean;
  review_reason: string | null;
  current_version_id: string | null;
  current_version?: {
    id: string;
    version_number: number;
    headline: string | null;
    body_html: string;
    created_at: string;
  } | null;
};

export function NrcsNewStoryForm({
  action,
  districtOptions,
  selectedDistrictKey,
}: {
  action: (formData: FormData) => Promise<void>;
  districtOptions: DistrictOption[];
  selectedDistrictKey: string;
}) {
  return (
    <form action={action} className="grid gap-4 rounded border border-neutral-200 bg-white p-6">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">District</span>
          <select name="district_key" defaultValue={selectedDistrictKey} className="rounded border border-neutral-300 px-3 py-2">
            {districtOptions.map((district) => (
              <option key={district.district_key} value={district.district_key}>
                {district.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Lifecycle</span>
          <select name="lifecycle_state" defaultValue="idea" className="rounded border border-neutral-300 px-3 py-2">
            {STORY_LIFECYCLE_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Title</span>
        <input name="title" required className="rounded border border-neutral-300 px-3 py-2" />
      </label>
      <div className="flex gap-3">
        <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Create Story</button>
        <Link href="/stories" className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold">
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function StoryOverviewForm({
  action,
  story,
  districtOptions,
}: {
  action: (formData: FormData) => Promise<void>;
  story: Story;
  districtOptions: DistrictOption[];
}) {
  return (
    <form action={action} className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
      <input type="hidden" name="id" value={story.id} />
      <h2 className="text-lg font-semibold">Overview</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">District</span>
          <select name="district_key" defaultValue={story.district_key} className="rounded border border-neutral-300 px-3 py-2">
            {districtOptions.map((district) => (
              <option key={district.district_key} value={district.district_key}>
                {district.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Lifecycle</span>
          <select name="lifecycle_state" defaultValue={story.lifecycle_state} className="rounded border border-neutral-300 px-3 py-2">
            {STORY_LIFECYCLE_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Title</span>
        <input name="title" defaultValue={story.title} required className="rounded border border-neutral-300 px-3 py-2" />
      </label>
      <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Save Overview</button>
    </form>
  );
}

export function FactsForm({
  action,
  storyId,
  bodyHtml,
}: {
  action: (formData: FormData) => Promise<void>;
  storyId: string;
  bodyHtml: string;
}) {
  return (
    <form action={action} className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
      <input type="hidden" name="story_id" value={storyId} />
      <h2 className="text-lg font-semibold">Facts & Reporting Notes</h2>
      <RichTextEditor name="body_html" initialHtml={bodyHtml} />
      <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Save Notes</button>
    </form>
  );
}

export function CopyStreamForms({
  action,
  storyId,
  streams,
}: {
  action: (formData: FormData) => Promise<void>;
  storyId: string;
  streams: CopyStream[];
}) {
  const streamsByType = new Map(streams.map((stream) => [stream.stream_type, stream]));
  return (
    <section className="grid gap-4">
      {COPY_STREAM_TYPES.map((streamType) => {
        const stream = streamsByType.get(streamType);
        const version = stream?.current_version || null;
        return (
          <form key={streamType} action={action} className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
            <input type="hidden" name="story_id" value={storyId} />
            <input type="hidden" name="stream_type" value={streamType} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{copyStreamLabel(streamType)}</h2>
                <p className="text-xs text-neutral-500">
                  Current version: {version ? `v${version.version_number}` : "none"}
                  {stream?.needs_review ? ` - Review needed: ${stream.review_reason || "information changed"}` : ""}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="information_changed" value="yes" />
                Information changed
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Headline</span>
              <input name="headline" defaultValue={version?.headline || ""} className="rounded border border-neutral-300 px-3 py-2" />
            </label>
            <RichTextEditor name="body_html" initialHtml={version?.body_html || ""} />
            <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
              Save New {copyStreamLabel(streamType)} Version
            </button>
          </form>
        );
      })}
    </section>
  );
}
