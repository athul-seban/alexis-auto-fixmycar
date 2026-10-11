import { NextResponse } from "next/server"
import { LOCALE_COOKIE, isLocale, isTranslatedPath, localePath, splitLocalePath } from "@/lib/i18n/config"

/**
 * Remembers the visitor's language (cookie) and sends them back. Used by the language switcher on pages that have no
 * translated version: their header and footer follow the chosen language, their main content stays English.
 * Only same-site relative paths are accepted for `next`, so this can't be used as an open redirect.
 */
export function GET(req: Request) {
  const url = new URL(req.url)
  const l = url.searchParams.get("l")
  const requested = url.searchParams.get("next") ?? "/"
  const safe = requested.startsWith("/") && !requested.startsWith("//") && !requested.includes("\\") ? requested : "/"

  if (!isLocale(l)) return NextResponse.redirect(new URL(safe, url))

  const { path } = splitLocalePath(safe.split(/[?#]/)[0])
  const target = isTranslatedPath(path) ? localePath(l, path) : safe
  const res = NextResponse.redirect(new URL(target, url))
  res.cookies.set(LOCALE_COOKIE, l, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
  return res
}
