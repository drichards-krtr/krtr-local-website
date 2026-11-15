import { getCurrentDistrict } from "@/lib/districtServer";
import { getDistrictConfig, type DistrictKey } from "@/lib/districts";

export default async function SiteIdentity({ districtKey, origin }: { districtKey?: DistrictKey; origin?: string }) {
  const district = districtKey ? getDistrictConfig(districtKey) : await getCurrentDistrict();
  const url = origin || `https://${district.host}`;
  const data = { "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", name: district.metadata.siteName, url, telephone: district.footer.phone,
      address: { "@type": "PostalAddress", streetAddress: district.footer.addressLine } },
    { "@type": "WebSite", name: district.metadata.siteName, url, description: district.metadata.defaultDescription },
  ] };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
