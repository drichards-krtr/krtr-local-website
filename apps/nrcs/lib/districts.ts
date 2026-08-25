import { createNrcsServerClient } from "./server";

export type NrcsDistrict = {
  id: string;
  district_key: string;
  subdomain: string;
  display_name: string;
  enabled: boolean;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
};

export type NrcsDistrictContext = {
  activeDistrict: NrcsDistrict | null;
  allowedDistricts: NrcsDistrict[];
};

export async function getNrcsDistrictContext(): Promise<NrcsDistrictContext> {
  const supabase = await createNrcsServerClient();
  const { data, error } = await supabase
    .from("nrcs_districts")
    .select(
      "id, district_key, subdomain, display_name, enabled, primary_contact_name, primary_contact_email, primary_contact_phone"
    )
    .eq("enabled", true)
    .order("display_name", { ascending: true });

  if (error) {
    return { activeDistrict: null, allowedDistricts: [] };
  }

  const districts = ((data || []) as NrcsDistrict[]).sort((a, b) => {
    if (a.district_key === "dlpc") return -1;
    if (b.district_key === "dlpc") return 1;
    return a.display_name.localeCompare(b.display_name);
  });

  return {
    activeDistrict: districts.find((district) => district.district_key === "dlpc") || districts[0] || null,
    allowedDistricts: districts,
  };
}
