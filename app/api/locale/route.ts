import { NextResponse } from "next/server"
import { safeCallbackUrl } from "@/lib/auth-routes"
import { LOCALE_COOKIE, isLocale, isTranslatedPath, localePath, splitLocalePath } from "@/lib/i18n/config"

/** A redirect that can only ever stay on this site, whatever `to` contains. */
function sameSiteRedirect(to: string, base: URL) {
  const dest = new URL(to, base)
  return NextResponse.redirect(dest.origin === base.origin ? dest : new URL("/", base))
}

/**
 * Remembers the visitor's language (cookie) and sends them back. Used by the language switcher on pages that have no
 * translated version: their header and footer follow the chosen language, their main content stays English.
 * Only same-site relative paths are accepted for `next`, so this can't be used as an open redirect. The check is the
 * shared safeCallbackUrl (rejects "//host", "/\host" and control characters: browsers strip tabs and newlines, so
 * "/\t/evil.com" would otherwise resolve to https://evil.com/), and the final URL's origin is verified as well.
 */
export function GET(req: Request) {
  const url = new URL(req.url)
  const l = url.searchParams.get("l")
  const safe = safeCallbackUrl(url.searchParams.get("next")) ?? "/"

  if (!isLocale(l)) return sameSiteRedirect(safe, url)

  const { path } = splitLocalePath(safe.split(/[?#]/)[0])
  const target = isTranslatedPath(path) ? localePath(l, path) : safe
  const res = sameSiteRedirect(target, url)
  res.cookies.set(LOCALE_COOKIE, l, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
  return res
}
