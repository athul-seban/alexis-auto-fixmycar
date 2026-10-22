// Cross-site request forgery guard for cookie-authenticated writes.
//
// The session cookie is SameSite=Lax, which stops other SITES from making a browser send it on a POST. It does NOT stop
// a sibling SUBDOMAIN: `evil.example.com` and `app.example.com` are the same site. Once each garage business has its own
// subdomain (and its editable content), that gap matters, so every write to /api must come from our own origin.
//
// Browsers always send `Origin` on a cross-origin POST/PUT/PATCH/DELETE, and `Sec-Fetch-Site` on every request. A client
// that sends neither (curl, a webhook, a cron caller) is not a browser, so it can't be riding someone's cookie.

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

export interface OriginCheckInput {
  method: string
  /** The `Origin` request header. */
  origin: string | null
  /** The `Sec-Fetch-Site` request header. */
  secFetchSite: string | null
  /** Host (with port) the request was addressed to: the `Host` or `X-Forwarded-Host` header. */
  hosts: ReadonlyArray<string | null>
  /** The site's own configured origin (NEXT_PUBLIC_APP_URL), for setups where the public host differs from the request's. */
  appOrigin?: string | null
}

const hostOf = (value: string): string | null => {
  try {
    return new URL(value).host
  } catch {
    return null
  }
}

/** True when this is a write that did not come from our own origin and should be refused. Reads are never blocked. */
export function isCrossSiteWrite(input: OriginCheckInput): boolean {
  if (!WRITE_METHODS.has(input.method.toUpperCase())) return false

  if (input.origin !== null) {
    const originHost = hostOf(input.origin)
    if (!originHost) return true // "null" (sandboxed frame, some redirects) or garbage: don't trust it with a cookie
    if (input.hosts.some((h) => h && h.toLowerCase() === originHost.toLowerCase())) return false
    const app = input.appOrigin ? hostOf(input.appOrigin) : null
    return !(app && app.toLowerCase() === originHost.toLowerCase())
  }

  if (input.secFetchSite !== null) return !(input.secFetchSite === "same-origin" || input.secFetchSite === "none")
  return false
}

/** Same check for a Web `Request` (what route handlers and the proxy have). */
export function isCrossSiteRequest(req: Request, appOrigin: string | null | undefined = process.env.NEXT_PUBLIC_APP_URL): boolean {
  return isCrossSiteWrite({
    method: req.method,
    origin: req.headers.get("origin"),
    secFetchSite: req.headers.get("sec-fetch-site"),
    hosts: [req.headers.get("host"), req.headers.get("x-forwarded-host")],
    appOrigin,
  })
}
