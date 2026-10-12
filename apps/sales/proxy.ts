import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSalesSupabaseEnv } from "./lib/env";

export async function proxy(request: NextRequest) {
  const env = getSalesSupabaseEnv();
  if (!env) { const response = NextResponse.next(); response.headers.set("Referrer-Policy", "no-referrer"); return response; }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anon, {
    cookieOptions: { name: "krtr-sales-auth", path: "/", sameSite: "lax" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
