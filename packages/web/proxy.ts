import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * GOTCHA: this is NOT the security boundary. It checks only that a cookie
 * exists — any value gets through. It cannot verify the signature because it
 * runs on the Edge runtime with no access to the SSM secret. Every admin page
 * and mutation must verify the session itself (lib/server/auth.ts).
 */
const SESSION_COOKIE = "admin_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the login page itself through.
  if (pathname === "/admin/login") return NextResponse.next();

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const hasCookie = request.cookies.has(SESSION_COOKIE);
    if (!hasCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
