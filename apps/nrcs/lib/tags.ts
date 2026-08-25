export const NRCS_TAG_TYPES = [
  "place",
  "organization",
  "person",
  "topic",
  "event_series",
  "other",
] as const;

export type NrcsTagType = (typeof NRCS_TAG_TYPES)[number];

export function slugifyNrcsTagName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
