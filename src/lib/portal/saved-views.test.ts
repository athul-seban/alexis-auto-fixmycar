import { describe, expect, it } from "vitest"
import { MAX_VIEWS, addView, parseViews, removeView, viewQuery } from "@/lib/portal/saved-views"

describe("parseViews", () => {
  it("returns [] for empty, invalid or non-array storage", () => {
    expect(parseViews(null)).toEqual([])
    expect(parseViews("{not json")).toEqual([])
    expect(parseViews(JSON.stringify({ a: 1 }))).toEqual([])
  })
  it("drops malformed entries", () => {
    const raw = JSON.stringify([{ name: "Ok", query: "a=1" }, { name: "", query: "x" }, { name: 3, query: "x" }, null])
    expect(parseViews(raw)).toEqual([{ name: "Ok", query: "a=1" }])
  })
})

describe("viewQuery", () => {
  it("keeps only the listed, non-empty keys", () => {
    const p = new URLSearchParams("source=WIDGET&page=3&booking=abc&q=")
    expect(viewQuery(p, ["source", "q"])).toBe("source=WIDGET")
  })
})

describe("addView / removeView", () => {
  it("adds, replaces by case-insensitive name, and removes", () => {
    let v = addView([], "Widget today", "source=WIDGET")!
    v = addView(v, "widget TODAY", "source=WIDGET&tab=today")!
    expect(v).toEqual([{ name: "widget TODAY", query: "source=WIDGET&tab=today" }])
    expect(removeView(v, "widget TODAY")).toEqual([])
  })
  it("refuses empty names, empty queries and more than the maximum", () => {
    expect(addView([], "  ", "a=1")).toBeNull()
    expect(addView([], "x", "")).toBeNull()
    const full = Array.from({ length: MAX_VIEWS }, (_, i) => ({ name: `v${i}`, query: "a=1" }))
    expect(addView(full, "one more", "a=1")).toBeNull()
    expect(addView(full, "v0", "b=2")).not.toBeNull() // replacing is still fine
  })
})
