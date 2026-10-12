import Link from "next/link";
import { getSalesSupabaseEnv } from "@/lib/env";
export const dynamic = "force-dynamic";
export default function Setup() {
  const configured = !!getSalesSupabaseEnv();
  return <><header><p className="eyebrow">KRTR Local</p><h1>Sales</h1></header><main>
    <section className="card"><span className="badge">Foundation setup</span><h2>{configured ? "Connection settings supplied" : "Sales database setup pending"}</h2>
    <p>The Sales app is ready for its dedicated Supabase project. Selling and customer access stay unavailable until the database and accounts are configured.</p>
    <p className="notice">No campaigns, payments, or customer records are connected on this screen.</p>
    {configured && <Link href="/login">Continue to sign in</Link>}</section>
    <div className="grid"><section className="card"><h2>Next setup steps</h2><ol><li>Create the dedicated Sales Supabase project.</li><li>Apply the Sales foundation migration and create Dan&apos;s owner account.</li><li>Configure authentication and connect the Sales Vercel project.</li></ol></section>
    <section className="card"><h2>Coming in later chunks</h2><p>Customer pipeline, quotes, agreements, payments, artwork approvals, and fulfillment will be added in the planned build order.</p></section></div>
  </main></>;
}
