import { createNrcsServerClient } from "./server";
import { getCmsDistricts } from "./cmsDistricts";

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

  const localDistricts = (data || []) as NrcsDistrict[];
  const cmsDistricts = await getCmsDistricts();
  const cmsDistrictsByKey = new Map(
    (cmsDistricts || []).map((district) => [district.district_key, district])
  );
  const mergedDistricts = localDistricts.map((district) => {
    const cmsDistrict = cmsDistrictsByKey.get(district.district_key);
    if (!cmsDistrict) return district;

    return {
      ...district,
      subdomain: cmsDistrict.subdomain,
      display_name: cmsDistrict.display_name,
      enabled: cmsDistrict.enabled,
      primary_contact_name: cmsDistrict.primary_contact_name,
      primary_contact_email: cmsDistrict.primary_contact_email,
      primary_contact_phone: cmsDistrict.primary_contact_phone,
    };
  });

  const districts = mergedDistricts.filter((district) => district.enabled).sort((a, b) => {
    if (a.district_key === "dlpc") return -1;
    if (b.district_key === "dlpc") return 1;
    return a.display_name.localeCompare(b.display_name);
  });

  return {
    activeDistrict: districts.find((district) => district.district_key === "dlpc") || districts[0] || null,
    allowedDistricts: districts,
  };
}
