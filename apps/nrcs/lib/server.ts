import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getNrcsServiceEnv, getNrcsSupabaseEnv } from "./env";

export function createNrcsServerClient() {
  const { url, anon } = getNrcsSupabaseEnv();

  type CookieStore = Awaited<ReturnType<typeof cookies>>;
  type CookieOptions = Omit<Parameters<CookieStore["set"]>[0], "name" | "value">;
  const cookieStore = cookies() as unknown as CookieStore;

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Components cannot mutate cookies; ignore and continue.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
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
