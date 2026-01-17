import { redirect } from "next/navigation";
import { createServerSupabase } from "./supabase/server";

export async function requireAdmin() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/cms/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    redirect("/cms/login");
  }

  return { user, profile };
}
