import { subdomainProblem } from "@/lib/org/subdomain"

// Which site is a request for? Every business website lives on <label>.<root domain>; everything else (the marketplace,
// the portals, the APIs) is the "apex". This is pure string work so it can be tested without a server. proxy.ts is the
// only caller that acts on it.
//
// Safety rules: the Host header is attacker-controlled, so it is accepted only in a strict shape, lower-cased, and must
// end in exactly `.<root domain>` with a single, valid, non-reserved label in front. Anything else is not a tenant.

export type HostKind = { kind: "apex" } | { kind: "tenant"; label: string }

/** Could this be a business's address label? (One valid, non-reserved label; used before anything touches the database.) */
export const isTenantLabel = (label: string): boolean => /^[a-z0-9-]+$/.test(label) && subdomainProblem(label) === null

/** The hostname without a port, or null when the header isn't a plausible host at all. */
export function hostnameOf(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null
  const host = hostHeader.trim().toLowerCase()
  // letters, digits, dots and hyphens, then an optional port. No userinfo, paths, spaces or brackets.
  const m = /^([a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)(?::(\d{1,5}))?$/.exec(host)
  if (!m) return null
  if (m[1].includes("..")) return null
  return m[1]
}

/** The root domain from configuration ("quotemygarage.com", or "localhost" in development), normalised; null when unset or junk. */
export function normaliseRootDomain(value: string | null | undefined): string | null {
  const host = hostnameOf(value ?? null)
  return host && !host.startsWith(".") ? host : null
}

/**
 * Classify a Host header. Without a configured root domain every host is the apex (websites are off). `www.<root>` and
 * the bare root are the apex. A single valid label in front of the root is a tenant.
 */
export function classifyHost(hostHeader: string | null | undefined, rootDomain: string | null | undefined): HostKind {
  const root = normaliseRootDomain(rootDomain)
  const host = hostnameOf(hostHeader)
  if (!root || !host) return { kind: "apex" }
  if (host === root) return { kind: "apex" }

  const suffix = `.${root}`
  if (!host.endsWith(suffix)) return { kind: "apex" } // another domain entirely (a preview URL, an IP): treated as the apex, never as a site

  const label = host.slice(0, -suffix.length)
  if (label === "www") return { kind: "apex" }
  // One label only (no "a.b.root"), and it has to be one a business could have chosen.
  if (!isTenantLabel(label)) return { kind: "apex" }
  return { kind: "tenant", label }
}

// ---- what to do with a request on a tenant host ---------------------------------------------------------------------

export type TenantAction =
  /** Serve this internal path (the site's page, image, sitemap, robots). */
  | { action: "rewrite"; path: string }
  /** Static files the page needs (fonts, scripts, icons): leave the request alone. */
  | { action: "pass" }
  /** A request with nothing to give (the favicon: the page names its own icon, and the platform's would be the wrong one). */
  | { action: "empty" }
  /** Not part of a website (login, dashboards, API...): send the visitor to the main site. */
  | { action: "apex" }
  /** Never reachable on a tenant host. */
  | { action: "notFound" }

const REWRITES: Record<string, string> = {
  "/": "",
  "/opengraph-image": "/opengraph-image",
  "/sitemap.xml": "/sitemap.xml",
  "/robots.txt": "/robots.txt",
}

/** What proxy.ts does with `pathname` on a tenant host. */
export function tenantRoute(label: string, pathname: string): TenantAction {
  // The internal site routes are reached only by rewriting from here, never directly (otherwise any host could read any site).
  if (pathname === "/sites" || pathname.startsWith("/sites/")) return { action: "notFound" }
  // Websites make no API calls; an API path on a tenant host is just wrong.
  if (pathname === "/api" || pathname.startsWith("/api/")) return { action: "notFound" }
  if (pathname === "/favicon.ico") return { action: "empty" }
  if (pathname.startsWith("/_next/") || pathname.startsWith("/icons/")) return { action: "pass" }

  const normalised = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  const suffix = REWRITES[normalised]
  if (suffix !== undefined) return { action: "rewrite", path: `/sites/${label}${suffix}` }
  return { action: "apex" }
}

/**
 * Where "go to the main site" points: built only from the configured app URL plus the request's own path and query, never
 * from anything else in the request, so a crafted Host or header can't turn this into an open redirect.
 */
export function apexUrl(appUrl: string | null | undefined, pathname: string, search: string): string | null {
  if (!appUrl) return null
  try {
    const base = new URL(appUrl)
    if (base.protocol !== "https:" && base.protocol !== "http:") return null
    const path = pathname.startsWith("/") && !pathname.startsWith("//") && !pathname.includes("\\") ? pathname : "/"
    return new URL(`${path}${search.startsWith("?") ? search : ""}`, base.origin).toString()
  } catch {
    return null
  }
}

// A redirect to the main site can't be sent straight from the proxy. Next rewrites a Location whose host equals the host it
// believes the request was for into a relative one, and in local development and `next start` that host is always the
// server's own origin, i.e. the main site's. The visitor's browser then follows "/login" on the business's own address and
// loops until it gives up. So the proxy rewrites to this internal route handler instead, which answers the 308 itself
// (route handler responses aren't post-processed). The target travels in a header the proxy sets, never one a visitor sends.
export const APEX_REDIRECT_PATH = "/sites/-/main-site"
export const APEX_REDIRECT_HEADER = "x-qmg-apex"

/** Is `target` an http(s) address on exactly the configured main site? Anything else is never redirected to. */
export function isApexTarget(target: string | null | undefined, appUrl: string | null | undefined): boolean {
  if (!target || !appUrl) return false
  try {
    const t = new URL(target)
    const base = new URL(appUrl)
    return (t.protocol === "https:" || t.protocol === "http:") && t.origin === base.origin
  } catch {
    return false
  }
}

/** The public address of a site, for canonical links, sitemaps and sharing. */
export function siteOrigin(label: string, rootDomain: string | null | undefined, appUrl: string | null | undefined): string | null {
  const root = normaliseRootDomain(rootDomain)
  if (!root) return null
  let protocol = "https:"
  let port = ""
  try {
    const app = new URL(appUrl ?? "")
    protocol = app.protocol
    // Local development keeps the dev server's port (acme.localhost:3000); a real domain has none.
    port = root === app.hostname || app.hostname.endsWith(`.${root}`) ? app.port : ""
  } catch {
    /* no app URL: assume https */
  }
  return `${protocol}//${label}.${root}${port ? `:${port}` : ""}`
}
