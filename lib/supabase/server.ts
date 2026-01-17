import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing Supabase env vars.");
  }

  return createServerClient(url, anon, {
    cookies: {
      get(name) {
        return cookies().get(name)?.value;
      },
      set(name, value, options) {
        cookies().set({ name, value, ...options });
      },
      remove(name, options) {
        cookies().set({ name, value: "", ...options });
      },
    },
  });
}
