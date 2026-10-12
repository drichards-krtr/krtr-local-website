import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { getSalesSupabaseEnv } from "@/lib/env";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  if (!getSalesSupabaseEnv()) redirect("/setup");
  const { notice } = await searchParams;
  return <main className="auth"><section className="card"><p className="eyebrow">KRTR Local Sales</p><h1>Sign in</h1>
    {notice === "access" && <p className="notice">Sign in with an active Sales account. Access must be assigned by KRTR.</p>}
    {notice === "password" && <p className="success">Password saved. Sign in with your new password.</p>}
    {notice === "callback" && <p className="error">This sign-in link is invalid or expired. Request a new link.</p>}
    <AuthForm mode="login" /><p><Link href="/reset-password">Forgot password?</Link></p><p className="muted">Access is by invitation. Customer invitations arrive in a later build chunk.</p>
  </section></main>;
}
