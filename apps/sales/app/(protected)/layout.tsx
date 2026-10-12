import Link from "next/link";
import { requireSalesIdentity } from "@/lib/auth";
import { signOut } from "@/lib/actions";
export const dynamic = "force-dynamic";
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const identity = await requireSalesIdentity();
  return <><header><p className="eyebrow">KRTR Local Sales</p><div className="row"><strong>{identity.profile.display_name || identity.user.email}</strong>{identity.isOwner && <span>Owner</span>}</div><nav><Link href="/dashboard">Dashboard</Link><Link href="/districts">Districts &amp; shows</Link>{identity.isOwner && <><Link href="/settings/regions">Regions &amp; assignments</Link><Link href="/settings/access">Staff access</Link></>}<form action={signOut}><button>Sign out</button></form></nav></header><main>{children}</main></>;
}
