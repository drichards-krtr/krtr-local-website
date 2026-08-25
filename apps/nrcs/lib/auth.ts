import { redirect } from "next/navigation";
import { createNrcsServerClient } from "./server";
import type { NrcsRole, NrcsStaffProfile } from "./roles";
import { hasNrcsRoleAtLeast } from "./roles";

export async function getCurrentNrcsStaff() {
  const supabase = createNrcsServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("nrcs_staff_profiles")
    .select("id, email, display_name, role, active, created_at, updated_at, last_seen_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile || !profile.active) {
    return null;
  }

  return { user, profile: profile as NrcsStaffProfile };
}

export async function requireNrcsStaff(minimumRole: NrcsRole = "contributor") {
  const staff = await getCurrentNrcsStaff();

  if (!staff) {
    redirect("/login");
  }

  if (!hasNrcsRoleAtLeast(staff.profile.role, minimumRole)) {
    redirect("/dashboard");
  }

  return staff;
}
