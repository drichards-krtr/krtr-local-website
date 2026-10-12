"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSalesServerClient } from "./server";
import { requireSalesOwner } from "./auth";
import { validStaffScope } from "./roles.mjs";

export async function signOut() {
  const supabase = await createSalesServerClient();
  await supabase.auth.signOut(); redirect("/login");
}
export async function saveRegion(form: FormData) {
  const { supabase } = await requireSalesOwner();
  const name = String(form.get("name") || "").trim();
  const id = String(form.get("id") || "").trim();
  if (!name || name.length > 100) redirect("/settings/regions?notice=invalid");
  const result = id ? await supabase.from("sales_regions").update({ name }).eq("id", id) : await supabase.from("sales_regions").insert({ name });
  if (result.error) redirect("/settings/regions?notice=failed");
  revalidatePath("/settings/regions"); redirect("/settings/regions?notice=saved");
}
export async function assignDistrictRegion(form: FormData) {
  const { supabase } = await requireSalesOwner();
  const districtKey = String(form.get("district_key") || "");
  const regionId = String(form.get("region_id") || "") || null;
  const { error } = await supabase.from("sales_districts").update({ region_id: regionId }).eq("district_key", districtKey);
  if (error) redirect("/settings/regions?notice=failed");
  revalidatePath("/settings/regions"); revalidatePath("/districts"); redirect("/settings/regions?notice=saved");
}

export async function setProfileActive(form: FormData) {
  const { supabase, user } = await requireSalesOwner();
  const id = String(form.get("user_id") || "");
  if (id === user.id) redirect("/settings/access?notice=failed");
  const { error } = await supabase.from("sales_profiles").update({ active: form.get("active") === "true" }).eq("id", id);
  if (error) redirect("/settings/access?notice=failed");
  revalidatePath("/settings/access"); redirect("/settings/access?notice=saved");
}
export async function assignStaffScope(form: FormData) {
  const { supabase } = await requireSalesOwner();
  const role = String(form.get("role") || "");
  const districtKey = String(form.get("district_key") || "") || null;
  const regionId = String(form.get("region_id") || "") || null;
  if (!validStaffScope(role, districtKey, regionId)) redirect("/settings/access?notice=failed");
  const { error } = await supabase.from("sales_staff_scopes").insert({ user_id: String(form.get("user_id") || ""), role, district_key: districtKey, region_id: regionId });
  if (error) redirect("/settings/access?notice=failed");
  revalidatePath("/settings/access"); redirect("/settings/access?notice=saved");
}
export async function removeStaffScope(form: FormData) {
  const { supabase } = await requireSalesOwner();
  const { error } = await supabase.from("sales_staff_scopes").delete().eq("id", String(form.get("id") || ""));
  if (error) redirect("/settings/access?notice=failed");
  revalidatePath("/settings/access"); redirect("/settings/access?notice=saved");
}
