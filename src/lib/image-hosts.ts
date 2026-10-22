// Which image URLs next/image may optimise. next.config.js is the single list (it passes it to the app as
// NEXT_PUBLIC_IMAGE_HOSTS, comma separated, `*.` for any subdomain); anything else must stay a plain <img>, because
// next/image throws for a host that isn't configured.

/** True when `src` is an https image on one of the allowed hosts. With no list configured (unit tests) nothing is. */
export function canOptimise(src: string | null | undefined, hostsCsv: string | undefined = process.env.NEXT_PUBLIC_IMAGE_HOSTS): boolean {
  if (!src || !hostsCsv) return false
  let url: URL
  try {
    url = new URL(src)
  } catch {
    return false
  }
  if (url.protocol !== "https:") return false
  const host = url.hostname.toLowerCase()
  return hostsCsv
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .some((pattern) => (pattern.startsWith("*.") ? host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1 : host === pattern))
}
