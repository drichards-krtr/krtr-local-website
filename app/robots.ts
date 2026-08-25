import type { MetadataRoute } from "next";
import { getCurrentDistrict } from "@/lib/districtServer";
import { absoluteUrl } from "@/lib/metadata";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const district = await getCurrentDistrict();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/cms/", "/api/"],
    },
    host: await absoluteUrl("/", district.key),
    sitemap: await absoluteUrl("/sitemap.xml", district.key),
  };
}
