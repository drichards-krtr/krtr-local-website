import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing Supabase env vars.");
  }

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
          // Server Components can't mutate cookies; ignore and continue.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // Server Components can't mutate cookies; ignore and continue.
        }
      },
    },
  });
}
