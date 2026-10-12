export const editableStages = ["prospect", "contacted", "needs_identified", "proposal_sent", "not_now", "lost"];
export const stageLabels = { prospect: "Prospect", contacted: "Contacted", needs_identified: "Needs identified", proposal_sent: "Proposal sent", signed_awaiting_payment: "Signed / awaiting payment", won: "Won", not_now: "Not now", lost: "Lost" };
export function centralToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function workBucket(item, today = centralToday()) {
  if (["lost", "won"].includes(item.stage)) return "closed";
  if (!item.next_action_on || !item.next_action.trim()) return "needs_action";
  if (item.next_action_on < today) return "overdue";
  return item.next_action_on === today ? "today" : "upcoming";
}
export function orderWork(items, today = centralToday()) {
  const rank = { overdue: 0, today: 1, needs_action: 2, upcoming: 3, closed: 4 };
  return [...items].sort((a,b) => rank[workBucket(a,today)] - rank[workBucket(b,today)] || (a.next_action_on || "").localeCompare(b.next_action_on || "") || a.id.localeCompare(b.id));
}
