import type { MetadataRoute } from "next";
import { getCurrentDistrict } from "@/lib/districtServer";

export default function manifest(): MetadataRoute.Manifest {
  const district = getCurrentDistrict();

  return {
    name: district.metadata.siteName,
    short_name: district.metadata.siteName.replace("KRTR Local | ", "KRTR "),
    description: district.metadata.defaultDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111827",
  };
}
