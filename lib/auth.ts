import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CMS_SESSION_COOKIE, isCmsSessionExpired } from "./cmsSession";
import { createServerSupabase } from "./supabase/server";

export async function requireAdmin() {
  const cmsSessionValue = cookies().get(CMS_SESSION_COOKIE)?.value;
  if (isCmsSessionExpired(cmsSessionValue)) {
    redirect("/cms/login");
  }

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
