import "server-only";
import { redirect } from "next/navigation";
import { getSalesSupabaseEnv } from "./env";
import { createSalesServerClient } from "./server";

export async function getSalesIdentity() {
  if (!getSalesSupabaseEnv()) return null;
  const supabase = await createSalesServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile, error: profileError } = await supabase.from("sales_profiles").select("id, display_name, active").eq("id", user.id).maybeSingle();
  if (profileError) throw new Error("Sales database setup is incomplete or unavailable.");
  if (!profile?.active) return null;
  const { data: owner, error: ownerError } = await supabase.from("sales_owner").select("user_id").eq("user_id", user.id).maybeSingle();
  if (ownerError) throw new Error("Sales permissions are unavailable.");
  const { data: workspace, error: workspaceError } = await supabase.rpc("sales_workspace_context");
  if (workspaceError) throw new Error("Sales customer/pipeline migration is required.");
  return { user, profile, isOwner: !!owner, isSalesStaff: workspace?.is_sales_staff === true, isProductionAgent: workspace?.is_production_agent === true, supabase };
}
export async function requireSalesIdentity() {
  if (!getSalesSupabaseEnv()) redirect("/setup");
  const identity = await getSalesIdentity();
  if (!identity) redirect("/login?notice=access");
  return identity;
}
export async function requireSalesOwner() {
  const identity = await requireSalesIdentity();
  if (!identity.isOwner) redirect("/dashboard?notice=owner-only");
  return identity;
}
