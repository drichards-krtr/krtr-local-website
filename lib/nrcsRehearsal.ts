import type { PublicationEnvelope } from "@/apps/nrcs/lib/editorialContract";

export type RehearsalStory = { id: string; district_key: string; slug: string | null; nrcs_output_id: string | null; nrcs_story_id: string | null };

export function districtCalendarDay(timezone: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function publicationEligibility(envelope: PublicationEnvelope, now = new Date()) {
  if (envelope.kind === "web") {
    const web = envelope.payload;
    const effectiveAt = web.status === "scheduled" ? web.scheduled_at : web.published_at;
    return { visible: ["published", "scheduled"].includes(web.status) && !!effectiveAt && Date.parse(effectiveAt) <= now.getTime(), effectiveAt };
  }
  if (envelope.kind === "alert") {
    const alert = envelope.payload;
    return { visible: alert.active && (!alert.start_at || Date.parse(alert.start_at) <= now.getTime()) && (!alert.end_at || now.getTime() < Date.parse(alert.end_at)), effectiveAt: alert.start_at };
  }
  if (envelope.kind === "daily") {
    const daily = envelope.payload;
    return { visible: ["scheduled", "published"].includes(daily.status) && Date.parse(daily.scheduled_at) <= now.getTime() && districtCalendarDay(daily.timezone, now) === districtCalendarDay(daily.timezone, new Date(daily.scheduled_at)), effectiveAt: daily.scheduled_at };
  }
  const home = envelope.payload;
  return { visible: !!home.daily && home.daily.publication_date === districtCalendarDay(home.timezone, now), effectiveAt: home.daily?.publication_date || null };
}

export function planWebProjection(envelope: PublicationEnvelope, candidates: RehearsalStory[], now = new Date()) {
  if (envelope.kind !== "web") throw new Error("Web publication required.");
  const scoped = candidates.filter(story => story.district_key === envelope.district_key);
  const linked = scoped.filter(story => story.id === envelope.payload.cms_article_id || story.nrcs_output_id === envelope.source_id || story.nrcs_story_id === envelope.payload.story_id);
  const bySlug = scoped.filter(story => !!envelope.payload.slug && story.slug === envelope.payload.slug);
  const problems: string[] = [];
  if (envelope.payload.cms_article_id && !scoped.some(story => story.id === envelope.payload.cms_article_id)) problems.push("Linked CMS article is missing or belongs to another district.");
  if (linked.length > 1 || bySlug.length > 1) problems.push("Multiple CMS articles match this output; explicit reconciliation required.");
  const existing = linked[0] || bySlug[0] || null;
  if (linked[0] && bySlug[0] && linked[0].id !== bySlug[0].id) problems.push("Requested slug belongs to a different CMS article.");
  if (existing?.nrcs_output_id && existing.nrcs_output_id !== envelope.source_id) problems.push("CMS article belongs to a different NRCS output.");
  if (existing?.nrcs_story_id && existing.nrcs_story_id !== envelope.payload.story_id) problems.push("CMS article belongs to a different NRCS Story.");
  return {
    action: problems.length ? "blocked" : existing ? "update_existing" : "create_new",
    cmsArticleId: existing?.id || null,
    publicPath: envelope.payload.slug ? `/stories/${envelope.payload.slug}` : existing ? `/stories/${existing.slug || existing.id}` : null,
    ...publicationEligibility(envelope, now),
    problems,
  };
}
