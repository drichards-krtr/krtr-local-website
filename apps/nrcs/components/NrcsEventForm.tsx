import Link from "next/link";
import RichTextEditor from "./RichTextEditor";
import { sortClassificationTerms, type EventClassificationTerm } from "@/lib/eventClassifications";

export type NrcsEventFormValue = {
  id?: string;
  district_key: string;
  title: string;
  body_html: string | null;
  location_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  start_at: string;
  end_at: string | null;
  image_url: string | null;
  status: string;
  classification_term_id: string | null;
};

type DistrictOption = {
  district_key: string;
  display_name: string;
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  event?: NrcsEventFormValue | null;
  districtOptions: DistrictOption[];
  selectedDistrictKey: string;
  terms: EventClassificationTerm[];
  submitLabel: string;
};

function dateTimeLocalValue(value: string | null | undefined) {
  return value ? value.slice(0, 16) : "";
}

export default function NrcsEventForm({
  action,
  event,
  districtOptions,
  selectedDistrictKey,
  terms,
  submitLabel,
}: Props) {
  const districtKey = event?.district_key || selectedDistrictKey;
  const sortedTerms = sortClassificationTerms(terms);

  return (
    <form action={action} className="grid gap-4 rounded border border-neutral-200 bg-white p-6">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">District</span>
          <select name="district_key" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2">
            {districtOptions.map((district) => (
              <option key={district.district_key} value={district.district_key}>
                {district.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Status</span>
          <select name="status" defaultValue={event?.status || "draft"} className="rounded border border-neutral-300 px-3 py-2">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Title</span>
        <input name="title" defaultValue={event?.title || ""} required className="rounded border border-neutral-300 px-3 py-2" />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Start</span>
          <input name="start_at" type="datetime-local" defaultValue={dateTimeLocalValue(event?.start_at)} required className="rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">End</span>
          <input name="end_at" type="datetime-local" defaultValue={dateTimeLocalValue(event?.end_at)} className="rounded border border-neutral-300 px-3 py-2" />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Location Name</span>
          <input name="location_name" defaultValue={event?.location_name || ""} required className="rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Address</span>
          <input name="address" defaultValue={event?.address || ""} required className="rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">City</span>
          <input name="city" defaultValue={event?.city || ""} required className="rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">State</span>
          <input name="state" defaultValue={event?.state || "IA"} required className="rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Zip</span>
          <input name="zip" defaultValue={event?.zip || ""} required className="rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Classification</span>
          <select
            name="classification_term_id"
            defaultValue={event?.classification_term_id || ""}
            className="rounded border border-neutral-300 px-3 py-2"
          >
            <option value="">None</option>
            {sortedTerms.map((term) => (
              <option key={term.id} value={term.id} disabled={!term.enabled && term.id !== event?.classification_term_id}>
                {term.name} ({term.kind.replace("_", " ")})
                {!term.enabled ? " - disabled" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Image URL</span>
        <input name="image_url" defaultValue={event?.image_url || ""} className="rounded border border-neutral-300 px-3 py-2" />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Details</span>
        <RichTextEditor name="body_html" initialHtml={event?.body_html || ""} />
      </label>

      <div className="flex gap-3">
        <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">{submitLabel}</button>
        <Link href={`/events?district=${districtKey}`} className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold">
          Cancel
        </Link>
      </div>
    </form>
  );
}
