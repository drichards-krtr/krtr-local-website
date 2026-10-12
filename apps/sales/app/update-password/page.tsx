import AuthForm from "@/components/AuthForm";
import { createSalesServerClient } from "@/lib/server";
import { getSalesSupabaseEnv } from "@/lib/env";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Update() {
  if (!getSalesSupabaseEnv()) redirect("/setup");
  const supabase = await createSalesServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?notice=callback");
  return <main className="auth"><section className="card"><h1>Set your password</h1><p>Use at least 12 characters.</p><AuthForm mode="password" /></section></main>;
}
