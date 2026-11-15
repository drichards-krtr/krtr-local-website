import DailyEditor from "@/components/cms/DailyEditor";
import { parseDistrictKey } from "@/lib/districts";

export default async function NewDailyPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{ district?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const districtKey = parseDistrictKey(searchParams?.district) || "dlpc";

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">New Daily</h1>
      <DailyEditor initialDistrictKey={districtKey} />
    </div>
  );
}
