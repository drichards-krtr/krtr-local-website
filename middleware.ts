import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { CMS_SESSION_COOKIE, isCmsSessionExpired } from "@/lib/cmsSession";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/cms") || pathname === "/cms/login") {
    return NextResponse.next();
  }

  const sessionValue = request.cookies.get(CMS_SESSION_COOKIE)?.value;
  if (!sessionValue || isCmsSessionExpired(sessionValue)) {
    const loginUrl = new URL("/cms/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(CMS_SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/cms", "/cms/:path*"],
};

