import Link from "next/link";
import { orderWork, stageLabels, workBucket } from "@/lib/workflow.mjs";
export type WorkItem = { id: string; organization_id: string; district_key: string; stage: string; next_action: string; next_action_on: string | null; business_goal: string; proposed_product: string; last_contact_at: string | null };
export default function WorkList({ items, companies, includeClosed = false }: { items: WorkItem[]; companies: Record<string, string>; includeClosed?: boolean }) {
 const visible = orderWork(items).filter(item => includeClosed || workBucket(item) !== "closed");
 return <>{!visible.length && <p>No unfinished follow-ups in your current scope.</p>}{visible.map(item => <section className="card" key={item.id}><div className="row"><span className="badge">{workBucket(item).replaceAll("_", " ")}</span><span>{stageLabels[item.stage as keyof typeof stageLabels]}</span><span>{item.district_key.toUpperCase()}</span></div><h3><Link href={`/opportunities/${item.id}`}>{companies[item.organization_id] || "Customer"}</Link></h3><p>{item.next_action || "Choose the next action"}{item.next_action_on ? ` · ${item.next_action_on}` : " · Date needed"}</p>{item.stage === "proposal_sent" && <p className="muted">Proposal follow-up remains open until answered.</p>}<p className="muted">{item.business_goal || "Business goal not yet identified"}</p></section>)}</>;
}
