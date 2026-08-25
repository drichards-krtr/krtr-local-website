import HomePageContent from "@/components/public/HomePageContent";
import { getCurrentDistrictKey } from "@/lib/districtServer";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { debug?: string };
}) {
  const siteScopeKey = await getCurrentDistrictKey();
  return (
    <HomePageContent
      siteScopeKey={siteScopeKey}
      debug={searchParams?.debug === "1"}
    />
  );
}
