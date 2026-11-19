import AssignmentDesk from "@/components/NrcsAssignmentDesk";
import type { DeskParams } from "@/components/NrcsAssignmentDesk";

export default async function Page({ searchParams }: { searchParams: Promise<DeskParams> }) {
  return <AssignmentDesk mode="assignments" params={await searchParams} />;
}
