import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSalesSupabaseEnv } from "./env";
export function createSalesAdminClient() {
  const env = getSalesSupabaseEnv();
  const key = process.env.SALES_SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !key) throw new Error("Customer account creation needs the dedicated Sales server key configured.");
  return createClient(env.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
