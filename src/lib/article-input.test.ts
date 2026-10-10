import { describe, expect, it } from "vitest"
import { articleInputSchema } from "./article-input"

const base = { title: "How to read an MOT advisory", body: "An advisory is not a fail, but it is worth acting on soon.", status: "DRAFT" as const }

describe("articleInputSchema", () => {
  it("derives the slug from the title and nulls empty optionals", () => {
    const a = articleInputSchema.parse({ ...base, excerpt: "  ", metaTitle: "" })
    expect(a.slug).toBe("how-to-read-an-mot-advisory")
    expect(a.excerpt).toBeNull()
    expect(a.metaTitle).toBeNull()
  })
  it("keeps a valid custom slug and rejects an invalid one", () => {
    expect(articleInputSchema.parse({ ...base, slug: "mot-advisories" }).slug).toBe("mot-advisories")
    expect(articleInputSchema.safeParse({ ...base, slug: "Not A Slug" }).success).toBe(false)
  })
  it("requires a real title, body and status", () => {
    expect(articleInputSchema.safeParse({ ...base, title: "ab" }).success).toBe(false)
    expect(articleInputSchema.safeParse({ ...base, body: "short" }).success).toBe(false)
    expect(articleInputSchema.safeParse({ ...base, status: "LIVE" }).success).toBe(false)
  })
})
