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
    <div className="grid"><section className="card"><h2>Next setup steps</h2><ol><li>Create the dedicated Sales Supabase project.</li><li>Apply the Sales migrations and create Dan&apos;s owner account.</li><li>Configure Sales authentication and environment variables.</li></ol></section>
    <section className="card"><h2>Build progress</h2><p>Customer organizations, invitations, permissions, and follow-ups are built. Connect the Sales database to use them. The product catalogue, versioned quotes, tax controls, and inventory foundation are also built. Agreements, payments, and fulfillment follow in later chunks.</p></section></div>
  </main></>;
}
