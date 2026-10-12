import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { redirect } from "next/navigation";
import { getSalesSupabaseEnv } from "@/lib/env";
export const dynamic = "force-dynamic";
export default function Reset() { if (!getSalesSupabaseEnv()) redirect("/setup"); return <main className="auth"><section className="card"><h1>Reset password</h1><AuthForm mode="reset" /><p><Link href="/login">Back to sign in</Link></p></section></main>; }
