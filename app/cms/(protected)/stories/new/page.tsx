import StoryEditor from "@/components/cms/StoryEditor";
import { getCurrentDistrictKey } from "@/lib/districtServer";
import { parseDistrictKey } from "@/lib/districts";
import { getTagTree } from "@/lib/tags";

export default function NewStoryPage({
  searchParams,
}: {
  searchParams?: { district?: string };
}) {
  const districtKey = parseDistrictKey(searchParams?.district) || getCurrentDistrictKey();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">New Story</h1>
      <StoryEditor initialDistrictKey={districtKey} tagTree={getTagTree(districtKey)} />
    </div>
  );
}
