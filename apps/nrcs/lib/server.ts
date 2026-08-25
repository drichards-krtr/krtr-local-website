import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getNrcsServiceEnv, getNrcsSupabaseEnv } from "./env";

export function createNrcsServerClient() {
  const { url, anon } = getNrcsSupabaseEnv();

  type CookieOptions = Omit<
    Parameters<ReturnType<typeof cookies>["set"]>[0],
    "name" | "value"
  >;

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookies().get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookies().set({ name, value, ...options });
        } catch {
          // Server Components cannot mutate cookies; ignore and continue.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookies().set({ name, value: "", ...options });
        } catch {
          // Server Components cannot mutate cookies; ignore and continue.
        }
      },
    },
  });
}

export function createNrcsServiceClient() {
  const { url, service } = getNrcsServiceEnv();
  return createClient(url, service, { auth: { persistSession: false } });
}
