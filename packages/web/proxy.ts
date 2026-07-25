import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Coarse UX redirect only: if there's no session cookie, bounce unauthenticated
 * visitors away from /admin to the login page. This is NOT the security
 * boundary — every admin page and mutation independently verifies the signed
 * session server-side (see lib/auth.ts). Signature verification isn't done here
 * because middleware runs on the Edge runtime without access to the SSM secret.
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
