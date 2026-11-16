import Content from "@/components/public/pages/CalendarPage";
import { getCurrentDistrictKey } from "@/lib/districtServer";
export const dynamic = "force-dynamic";
export default async function Page(props: {searchParams?: Promise<Record<string, string | string[]>>}) {
 return <Content districtKey={await getCurrentDistrictKey()} searchParams={props.searchParams} />;
}
