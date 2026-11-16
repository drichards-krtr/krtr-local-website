import Content from "@/components/public/pages/TagPage";
import { getCurrentDistrictKey } from "@/lib/districtServer";
export const dynamic = "force-dynamic";
export default async function Page(props: {params: Promise<{slug:string}>}) {
 return <Content districtKey={await getCurrentDistrictKey()} params={props.params} />;
}
