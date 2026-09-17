import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import MigrationConsole from "./MigrationConsole";
import { createNrcsServerClient } from "@/lib/server";

export default async function MigrationsPage() {
  await requireNrcsStaff("admin");
  const context = await getNrcsDistrictContext();
  const db = await createNrcsServerClient();
  const districts = await db.from("nrcs_districts").select("district_key,display_name,enabled").order("display_name");
  const owners = await db.from("nrcs_staff_profiles").select("id,email").order("email").limit(500);
  const terms = await db.from("nrcs_event_classification_terms").select("id,district_key,kind,name").eq("enabled", true).order("name").limit(1000);
  const tags = await db.from("nrcs_tags").select("id,name,slug").order("name").limit(1000);
  if (tags.error) throw new Error(tags.error.message);
  if (districts.error || owners.error || terms.error) throw new Error(districts.error?.message || owners.error?.message || terms.error?.message);
  return <MigrationConsole tags={tags.data || []} owners={owners.data || []} terms={terms.data || []} districts={(districts.data || []).map(district => ({ key: district.district_key, name: district.display_name + (district.enabled ? "" : " (Disabled)") }))} defaultDistrict={context.activeDistrict?.district_key || ""} />;
}
