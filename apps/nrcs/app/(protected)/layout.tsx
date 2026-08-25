import type { ReactNode } from "react";
import NrcsShell from "@/components/NrcsShell";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";

export const dynamic = "force-dynamic";

export default async function NrcsProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { profile } = await requireNrcsStaff();
  const districtContext = await getNrcsDistrictContext();
  return (
    <NrcsShell profile={profile} districtContext={districtContext}>
      {children}
    </NrcsShell>
  );
}
