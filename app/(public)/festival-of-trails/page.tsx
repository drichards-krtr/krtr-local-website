import Content from "@/components/public/pages/FestivalPage";
import { getCurrentDistrictKey } from "@/lib/districtServer";
export const dynamic = "force-dynamic";
export default async function Page(props: {}) {
 return <Content districtKey={await getCurrentDistrictKey()}  />;
}
