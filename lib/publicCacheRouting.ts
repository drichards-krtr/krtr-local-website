export const CALENDAR_QUERY_KEYS = new Set([
  "towns", "sports", "activities", "event_type", "view", "offset", "week_start",
  "weeks", "selected_event", "include_school_sports",
]);
const STATIC_VIEWS = new Set(["about", "advertise", "termsprivacy", "festival-of-trails", "vote", "weather", "watch-live"]);
const DYNAMIC_PREFIXES = new Set(["api", "cms", "_next", "stories", "article-cache", "public-cache", "nominations", "submit-story", "tags", "calendar", "garage-sales"]);

export function publicCacheDestination(pathname: string, query: URLSearchParams) {
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) {
    if (query.get("debug") === "1") return null;
    return { view: "home", parts: [] as string[] };
  }
  if (segments.length === 2 && segments[0] === "tags") return { view: "tag", parts: [segments[1]] };
  if (segments.length !== 1) return null;
  const name = segments[0];
  if (name === "calendar" || name === "garage-sales") {
    const selected = new URLSearchParams();
    for (const [key, value] of query) {
      if (name === "calendar" ? CALENDAR_QUERY_KEYS.has(key) : key === "date") selected.append(key, value);
    }
    selected.sort(); // Stable sort retains last-value checkbox semantics.
    const encoded = selected.toString();
    if (encoded.length > 2048) return null;
    return { view: name, parts: encoded ? [Buffer.from(encoded).toString("base64url")] : [] };
  }
  if (STATIC_VIEWS.has(name)) return { view: name, parts: [] as string[] };
  if (DYNAMIC_PREFIXES.has(name) || name.includes(".")) return null;
  return { view: "daily", parts: [name] };
}

export function decodePublicQuery(token?: string): Record<string, string | string[]> {
  if (!token) return {};
  if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length > 2800) throw new Error("Invalid query token");
  const query = new URLSearchParams(Buffer.from(token, "base64url").toString());
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(query.keys())) {
    const values = query.getAll(key);
    result[key] = values.length === 1 ? values[0] : values;
  }
  return result;
}
