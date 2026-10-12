import { NextResponse } from "next/server";
import { createSalesServerClient } from "@/lib/server";
import { getSalesSupabaseEnv, getSalesSiteUrl } from "@/lib/env";
import { authDestination } from "@/lib/redirects.mjs";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getSalesSiteUrl();
  if (!getSalesSupabaseEnv()) return NextResponse.redirect(new URL("/setup", origin));
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createSalesServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(authDestination(url.searchParams.get("next")), origin));
  }
  return NextResponse.redirect(new URL("/login?notice=callback", origin));
}
