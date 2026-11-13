import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

/**
 * Next.js 16 proxy (formerly middleware):
 *  1. Locale routing for pages (next-intl).
 *  2. Fast gate for backoffice pages: no session cookie → login redirect.
 *     This is only a UX shortcut; every admin page and API re-validates the
 *     session server-side.
 * API routes, static assets and media are excluded by the matcher.
 */
const intl = createIntlMiddleware(routing);

const ADMIN_PUBLIC = new Set(["/login", "/reset-password", "/forgot-password"]);

function sessionCookieName(): string {
  const name = process.env.SESSION_COOKIE_NAME ?? "__Host-pst_session";
  return process.env.NODE_ENV === "production" ? name : name.replace(/^__Host-/, "");
}

export default function proxy(req: NextRequest) {
  const match = /^\/(tet|pt|id|en)\/admin(\/[^?]*)?$/.exec(req.nextUrl.pathname);
  if (match) {
    const sub = match[2] ?? "/";
    if (!ADMIN_PUBLIC.has(sub) && !req.cookies.has(sessionCookieName())) {
      const url = req.nextUrl.clone();
      url.pathname = `/${match[1]}/admin/login`;
      url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
      return NextResponse.redirect(url);
    }
  }
  return intl(req);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|media|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\..*).*)"],
};
