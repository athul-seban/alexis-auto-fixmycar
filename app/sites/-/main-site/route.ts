import { APEX_REDIRECT_HEADER, isApexTarget } from "@/lib/org/host"

// "Go to the main site" for a request that arrived on a business's own address (login, dashboards, search...). proxy.ts
// rewrites here and puts the destination in a header; this answers the 308. It exists because the proxy's own redirect
// would be rewritten into a relative one that loops (see APEX_REDIRECT_PATH in src/lib/org/host.ts).
//
// Reachable only through that rewrite: the proxy answers 404 to /sites/* on every host before anything runs, and it replaces
// the header on every tenant request. The destination is still checked against the configured main site, so even a request
// that did get here with a forged header can't be sent anywhere else.
export const dynamic = "force-dynamic"

function redirect(req: Request): Response {
  const to = req.headers.get(APEX_REDIRECT_HEADER)
  if (!isApexTarget(to, process.env.NEXT_PUBLIC_APP_URL)) return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } })
  // 308 keeps the method and body. Not cacheable: it depends on configuration that can change.
  return new Response(null, { status: 308, headers: { Location: to as string, "Cache-Control": "no-store" } })
}

export const GET = redirect
export const HEAD = redirect
export const POST = redirect
export const PUT = redirect
export const PATCH = redirect
export const DELETE = redirect
export const OPTIONS = redirect
