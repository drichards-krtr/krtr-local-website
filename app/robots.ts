import type { MetadataRoute } from "next";
import { getCurrentDistrict } from "@/lib/districtServer";
import { absoluteUrl } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
  const district = getCurrentDistrict();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/cms/", "/api/"],
    },
    host: absoluteUrl("/", district.key),
    sitemap: absoluteUrl("/sitemap.xml", district.key),
  };
}
