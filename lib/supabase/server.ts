import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing Supabase env vars.");
  }

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
        cookies().set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        cookies().set({ name, value: "", ...options });
      },
    },
  });
}
