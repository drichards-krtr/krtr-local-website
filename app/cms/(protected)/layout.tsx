import type { ReactNode } from "react";
import CmsShell from "@/components/cms/CmsShell";
import { requireAdmin } from "@/lib/auth";

export default async function CmsProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin();
  return <CmsShell>{children}</CmsShell>;
}
