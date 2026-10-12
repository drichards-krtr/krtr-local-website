import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSalesSupabaseEnv } from "./env";

export async function createSalesServerClient() {
  const env = getSalesSupabaseEnv();
  if (!env) throw new Error("Sales Supabase is not configured.");
  const store = await cookies();
  return createServerClient(env.url, env.anon, {
    cookieOptions: { name: "krtr-sales-auth", path: "/", sameSite: "lax" },
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try { for (const { name, value, options } of values) store.set(name, value, options); }
        catch { /* Server Components cannot write cookies; proxy handles refresh. */ }
      },
    },
  });
}
