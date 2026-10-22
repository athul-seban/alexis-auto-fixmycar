// Three jobs (renamed from middleware.ts in Next 16):
//  1. Gate the three portals. Real authorisation still happens per request: layouts re-check the session and every
//     /api/* handler checks its own role (the proxy does no authorisation on /api).
//  2. Language routing for the public site: /fr/... and /de/... are rewritten to the normal page with the language
//     passed in a request header (x-qmg-locale). English has no prefix. Only translated pages have language URLs;
//     any other /fr/... path redirects to the English page so there is no duplicate content.
//  3. Refuse cross-site writes to /api (CSRF), including from a sibling subdomain.
import { withAuth, type NextRequestWithAuth } from "next-auth/middleware"
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"
import { isAdmin } from "@/lib/roles"
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, isTranslatedPath, splitLocalePath } from "@/lib/i18n/config"
import { isCrossSiteRequest } from "@/lib/origin"

const authProxy = withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const pathname = req.nextUrl.pathname

    // Admin routes
    if (pathname.startsWith("/admin") && !isAdmin(token?.role as string | undefined)) {
      return NextResponse.redirect(new URL("/login?error=unauthorized", req.url))
    }

    // Garage dashboard routes
    if (pathname.startsWith("/garage-dashboard") && token?.role !== "GARAGE") {
      return NextResponse.redirect(new URL("/login?error=unauthorized", req.url))
    }

    // Owner dashboard routes
    if (pathname.startsWith("/dashboard") && token?.role !== "OWNER") {
      return NextResponse.redirect(new URL("/login?error=unauthorized", req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname
        const protectedRoutes = ["/dashboard", "/garage-dashboard", "/admin"]
        if (protectedRoutes.some((route) => pathname.startsWith(route))) {
          return !!token
        }
        return true
      },
    },
  }
)

const PORTALS = ["/dashboard", "/garage-dashboard", "/admin"]

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl

  // API writes must come from our own origin (see src/lib/origin.ts). NextAuth keeps its own CSRF token, so /api/auth is
  // left to it. Reads, and callers that aren't browsers (webhooks, cron), are untouched.
  if (pathname.startsWith("/api/")) {
    if (!pathname.startsWith("/api/auth/") && isCrossSiteRequest(req)) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 })
    }
    return NextResponse.next()
  }

  if (PORTALS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return authProxy(req as NextRequestWithAuth, event)

  const { locale: prefixed, path } = splitLocalePath(pathname)

  if (prefixed) {
    if (!isTranslatedPath(path)) {
      const url = req.nextUrl.clone()
      url.pathname = path
      return NextResponse.redirect(url)
    }
    const headers = new Headers(req.headers)
    headers.set("x-qmg-locale", prefixed)
    headers.set("x-qmg-path", path)
    const url = req.nextUrl.clone()
    url.pathname = path
    const res = NextResponse.rewrite(url, { request: { headers } })
    res.cookies.set(LOCALE_COOKIE, prefixed, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
    return res
  }

  // Translated pages: the URL decides, so an English URL is always English. Other pages keep the visitor's chosen
  // language for the shared header and footer (their main content is English).
  const cookie = req.cookies.get(LOCALE_COOKIE)?.value
  const locale = isTranslatedPath(pathname) ? DEFAULT_LOCALE : isLocale(cookie) ? cookie : DEFAULT_LOCALE
  const headers = new Headers(req.headers)
  headers.set("x-qmg-locale", locale)
  headers.set("x-qmg-path", pathname)
  return NextResponse.next({ request: { headers } })
}

// Every page except Next internals and files with an extension (images, sitemap.xml, sw.js ...), plus /api for the
// cross-site write check above (the proxy does no authorisation on /api: each handler checks its own role).
export const config = {
  matcher: ["/api/:path*", "/((?!api|_next|.*\\..*).*)"],
}
