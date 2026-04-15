import { NextResponse } from "next/server";
import { CMS_SESSION_COOKIE, CMS_SESSION_MAX_AGE_SECONDS } from "@/lib/cmsSession";

function buildCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CMS_SESSION_MAX_AGE_SECONDS,
  };
}

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CMS_SESSION_COOKIE, String(Date.now()), buildCookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CMS_SESSION_COOKIE, "", {
    ...buildCookieOptions(),
    maxAge: 0,
  });
  return response;
}

