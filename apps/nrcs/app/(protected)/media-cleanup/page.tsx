import { requireNrcsStaff } from "@/lib/auth";
import NrcsMediaCleanup from "@/components/NrcsMediaCleanup";

export default async function MediaCleanupPage() { await requireNrcsStaff("admin"); return <NrcsMediaCleanup />; }
