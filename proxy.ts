// Four jobs (renamed from middleware.ts in Next 16):
//  0. Business websites: <label>.<root domain> is rewritten to /sites/<label>, anything that isn't a website page is sent to
//     the main site, and the internal /sites routes can't be opened directly (src/lib/org/host.ts).
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
import { apexUrl, classifyHost, tenantRoute } from "@/lib/org/host"

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

/** The header the site page reads to know it is serving a business website. Only this file may set it. */
export const SITE_HEADER = "x-qmg-site"

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } })

/** Requests for <label>.<root domain>: serve that business's site, or send everything else to the main site. */
function tenantProxy(req: NextRequest, label: string) {
  const { pathname, search } = req.nextUrl
  const route = tenantRoute(label, pathname)
  const headers = new Headers(req.headers)
  headers.delete(SITE_HEADER)
  switch (route.action) {
    case "rewrite": {
      headers.set(SITE_HEADER, label)
      const url = req.nextUrl.clone()
      url.pathname = route.path
      return NextResponse.rewrite(url, { request: { headers } })
    }
    case "pass":
      return NextResponse.next({ request: { headers } })
    case "empty":
      return new NextResponse(null, { status: 204, headers: { "Cache-Control": "public, max-age=86400" } })
    case "apex": {
      // 308 keeps the method and body; the target is built from the configured app URL and this request's own path.
      const target = apexUrl(process.env.NEXT_PUBLIC_APP_URL, pathname, search)
      return target ? NextResponse.redirect(target, 308) : notFound()
    }
    case "notFound":
      return notFound()
  }
}

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl

  // Business websites live on <label>.<root domain>. Anything arriving there is handled on its own: no portal gate, no
  // language routing, no API. (Hosts that aren't a site, including the marketplace itself, fall through unchanged.)
  const host = classifyHost(req.headers.get("host"), process.env.NEXT_PUBLIC_ROOT_DOMAIN)
  if (host.kind === "tenant") return tenantProxy(req, host.label)

  // The internal site routes are reachable only by the rewrite above, never directly on the marketplace's own address.
  if (pathname === "/sites" || pathname.startsWith("/sites/")) return notFound()

  // The marketplace never legitimately receives the internal site header (only this file sets it, on its own rewrite), so a
  // request that carries one is forged. Refusing it outright means a visitor can't make a page render as someone's site.
  if (req.headers.has(SITE_HEADER)) return new NextResponse("Bad request", { status: 400 })

  // sitemap.xml, robots.txt and favicon.ico are in the matcher only so a tenant host can be told apart; on the marketplace
  // they are served as usual.
  if (pathname === "/sitemap.xml" || pathname === "/robots.txt" || pathname === "/favicon.ico") return NextResponse.next()

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

// Every page except Next internals and files with an extension (images, sw.js ...), plus /api for the cross-site write
// check above (the proxy does no authorisation on /api: each handler checks its own role), plus sitemap.xml and
// robots.txt, which have an extension but must reach a tenant host's own copy.
export const config = {
  matcher: ["/api/:path*", "/sitemap.xml", "/robots.txt", "/favicon.ico", "/((?!api|_next|.*\\..*).*)"],
}
