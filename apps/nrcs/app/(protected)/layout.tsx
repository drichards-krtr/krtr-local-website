import type { ReactNode } from "react";
import NrcsShell from "@/components/NrcsShell";
import { requireNrcsStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NrcsProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { profile } = await requireNrcsStaff();
  return <NrcsShell profile={profile}>{children}</NrcsShell>;
}
