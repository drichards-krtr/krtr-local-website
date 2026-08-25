"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getNrcsSupabaseEnv } from "./env";

export function createNrcsBrowserClient() {
  const { url, anon } = getNrcsSupabaseEnv();
  return createBrowserClient(url, anon);
}
