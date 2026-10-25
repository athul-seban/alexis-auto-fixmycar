import { describe, expect, it } from "vitest"
import { defaultContent } from "@/lib/site/content"
import { SITE_CACHE_VERSION } from "@/lib/site/public-cached"

// The cached copy of a site outlives a deploy, so code that expects a new shape must never be handed an old cached one (that
// crashed the page when `pro` and `trust` were added). This pins the shape of the stored content together with the cache
// version: if you change the content's fields, this fails until you raise SITE_CACHE_VERSION and update both numbers here.
// (The other half of the cached value, PublicSite in src/lib/site/public.ts, is the same rule by hand: raise the version.)

function paths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return [`${prefix}[]`]
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k))
  return [prefix]
}

const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7).toString(36)

describe("the cached site's shape", () => {
  it("goes with the cache version: change the content's fields and raise SITE_CACHE_VERSION", () => {
    const shape = hash(paths(defaultContent("Acme")).sort().join("|"))
    expect({ version: SITE_CACHE_VERSION, shape }).toEqual({ version: 2, shape: "-iqbr8v" })
  })
})
