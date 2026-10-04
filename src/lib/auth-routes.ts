// Role-aware landing + callback-URL safety. Shared by the login flow, /post-login and the Header.

export function roleHome(role?: string | null): string {
  if (role === "ADMIN") return "/admin"
  if (role === "GARAGE") return "/garage-dashboard"
  return "/dashboard"
}

// Only same-origin relative paths are allowed ("/x", never "//host" or "/\host").
export function safeCallbackUrl(url?: string | null): string | null {
  if (!url) return null
  if (!url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) return null
  if (/[\u0000-\u001f]/.test(url)) return null
  return url
}

const ROLE_PREFIXES: { prefix: string; role: string }[] = [
  { prefix: "/admin", role: "ADMIN" },
  { prefix: "/garage-dashboard", role: "GARAGE" },
  { prefix: "/dashboard", role: "OWNER" },
]

// Mirrors middleware.ts: a role-restricted area is only allowed for its own role.
export function isAllowedForRole(role: string | null | undefined, path: string): boolean {
  const restricted = ROLE_PREFIXES.find(({ prefix }) => path.startsWith(prefix))
  if (!restricted) return true
  return restricted.role === role
}

export function postLoginPath(callbackUrl?: string | null): string {
  const safe = safeCallbackUrl(callbackUrl)
  return safe ? `/post-login?next=${encodeURIComponent(safe)}` : "/post-login"
}
