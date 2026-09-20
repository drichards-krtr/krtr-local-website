import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { legacyEditorialEnabled } from "@/lib/editorialFeatureFlag";

export async function assertLegacyEditorialWrites() {
  if (!legacyEditorialEnabled()) throw new Error("Legacy editorial writes are disabled; use NRCS.");
  const { data, error } = await createServiceClient().from("editorial_authority")
    .select("legacy_writes_enabled").eq("singleton", true).abortSignal(AbortSignal.timeout(10000)).single();
  if (error || data?.legacy_writes_enabled !== true) throw new Error("Legacy editorial writes are disabled or authority configuration is unavailable.");
}
