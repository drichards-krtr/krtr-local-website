import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { CMS_SESSION_COOKIE, isCmsSessionExpired } from "@/lib/cmsSession";
import { isLegacyEditorialPath, legacyEditorialEnabled } from "@/lib/editorialFeatureFlag";
import { isExplicitDistrictHost, resolveDistrictFromHost } from "@/lib/districts";
import { publicCacheDestination } from "@/lib/publicCacheRouting";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Scope is encoded into the internal path, so ISR never shares a district's
  // output with another host. Only trusted host routing selects this scope.
  if (/^\/(article-cache|public-cache)(\/|$)/.test(pathname)) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (request.method === "GET" || request.method === "HEAD") {
    const route = publicCacheDestination(pathname, request.nextUrl.searchParams);
    if (route) {
      const host = request.headers.get("host");
      const scope = isExplicitDistrictHost(host) ? resolveDistrictFromHost(host) : "global";
      const destination = request.nextUrl.clone();
      destination.pathname = `/public-cache/${scope}/${route.view}${route.parts.length ? "/" + route.parts.join("/") : ""}`;
      destination.search = "";
      return NextResponse.rewrite(destination);
    }
  }
  if (/^\/stories\/[^/]+\/?$/.test(pathname)) {
    const host = request.headers.get("host");
    const scope = isExplicitDistrictHost(host) ? resolveDistrictFromHost(host) : "global";
    const destination = request.nextUrl.clone();
    destination.pathname = `/article-cache/${scope}/${pathname.split("/")[2]}`;
    return NextResponse.rewrite(destination);
  }

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

  if (!legacyEditorialEnabled() && isLegacyEditorialPath(pathname)) {
    return NextResponse.redirect(new URL("/cms", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|[^/]+\\.[^/]+$).*)"],
};
