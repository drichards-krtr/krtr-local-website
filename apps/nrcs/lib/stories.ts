import { sanitizeRichTextHtml } from "./richText";

export const STORY_LIFECYCLE_STATES = ["idea", "reporting", "ready", "active", "dormant", "closed"] as const;
export const COPY_STREAM_TYPES = ["web", "rundown", "social"] as const;

export type StoryLifecycleState = (typeof STORY_LIFECYCLE_STATES)[number];
export type CopyStreamType = (typeof COPY_STREAM_TYPES)[number];

export function isStoryLifecycleState(value: string): value is StoryLifecycleState {
  return STORY_LIFECYCLE_STATES.includes(value as StoryLifecycleState);
}

export function copyStreamLabel(type: CopyStreamType) {
  if (type === "web") return "Web Copy";
  if (type === "rundown") return "Rundown Copy";
  return "Social Copy";
}

export function sanitizeStoryHtml(value: FormDataEntryValue | null) {
  return sanitizeRichTextHtml(String(value || ""));
}

export function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}
