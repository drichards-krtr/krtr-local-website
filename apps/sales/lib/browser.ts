"use client";
import { createBrowserClient } from "@supabase/ssr";
import { getSalesSupabaseEnv } from "./env";
export function createSalesBrowserClient() {
  const env = getSalesSupabaseEnv();
  if (!env) throw new Error("Sales Supabase is not configured.");
  return createBrowserClient(env.url, env.anon, {
    cookieOptions: { name: "krtr-sales-auth", path: "/", sameSite: "lax" },
  });
}
