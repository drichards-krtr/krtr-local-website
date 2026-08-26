import { getNrcsCmsApiEnv } from "./env";

export type CmsDistrict = {
  district_key: string;
  subdomain: string;
  display_name: string;
  enabled: boolean;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
};

export async function getCmsDistricts(): Promise<CmsDistrict[] | null> {
  const env = getNrcsCmsApiEnv();
  if (!env) return null;

  let response: Response;
  try {
    response = await fetch(`${env.baseUrl}/api/nrcs/districts`, {
      headers: {
        Authorization: `Bearer ${env.secret}`,
      },
      cache: "no-store",
      redirect: "manual",
    });
  } catch (error) {
    console.error("[getCmsDistricts] CMS district request failed", error);
    return null;
  }

  if (!response.ok) {
    console.error("[getCmsDistricts] CMS district request rejected", {
      status: response.status,
      body: await response.text().catch(() => ""),
    });
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    console.error("[getCmsDistricts] CMS district request returned non-JSON", {
      contentType,
    });
    return null;
  }

  const payload = (await response.json().catch(() => null)) as {
    ok?: unknown;
    districts?: unknown;
  } | null;

  if (!payload?.ok || !Array.isArray(payload.districts)) {
    console.error("[getCmsDistricts] CMS district response was not confirmed");
    return null;
  }

  return payload.districts as CmsDistrict[];
}
