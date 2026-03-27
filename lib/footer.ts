import { cache } from "react";
import { getDistrictConfig, type DistrictKey } from "@/lib/districts";
import { createPublicClient } from "@/lib/supabase/public";

export type FooterSettings = {
  legal_name: string;
  address_line: string;
  phone: string;
};

export const getFooterSettings = cache(async function getFooterSettings(
  districtKey: DistrictKey
): Promise<FooterSettings> {
  const district = getDistrictConfig(districtKey);
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("footer_settings")
    .select("legal_name, address_line, phone")
    .eq("district_key", districtKey)
    .maybeSingle();

  if (error) {
    console.error("[footer:getFooterSettings] Supabase query failed", { districtKey, error });
    return {
      legal_name: district.footer.legalName,
      address_line: district.footer.addressLine,
      phone: district.footer.phone,
    };
  }

  return {
    legal_name: data?.legal_name || district.footer.legalName,
    address_line: data?.address_line || district.footer.addressLine,
    phone: data?.phone || district.footer.phone,
  };
});
