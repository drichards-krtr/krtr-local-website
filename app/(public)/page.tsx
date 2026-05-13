import HomePageContent from "@/components/public/HomePageContent";
import { getCurrentDistrictKey } from "@/lib/districtServer";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { debug?: string };
}) {
  return (
    <HomePageContent
      siteScopeKey={getCurrentDistrictKey()}
      debug={searchParams?.debug === "1"}
    />
  );
}
