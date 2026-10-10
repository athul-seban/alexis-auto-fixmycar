import { describe, expect, it } from "vitest"
import { excerptOf, isValidSlug, parseArticleBody, parseInline, plainText, readingMinutes, safeHref, slugify } from "./articles"

describe("safeHref", () => {
  it("allows web, site-relative and mailto links", () => {
    expect(safeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1")
    expect(safeHref("/search?service=MOT")).toBe("/search?service=MOT")
    expect(safeHref("mailto:hi@example.com")).toBe("mailto:hi@example.com")
  })
  it("rejects script, data and protocol-relative links", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull()
    expect(safeHref("data:text/html,<b>x</b>")).toBeNull()
    expect(safeHref("//evil.example.com")).toBeNull()
    expect(safeHref("JaVaScRiPt:alert(1)")).toBeNull()
  })
})

describe("parseInline", () => {
  it("parses bold, italic and links", () => {
    expect(parseInline("a **b** *c* [d](https://x.io) e")).toEqual([
      { type: "text", text: "a " },
      { type: "strong", text: "b" },
      { type: "text", text: " " },
      { type: "em", text: "c" },
      { type: "text", text: " " },
      { type: "link", text: "d", href: "https://x.io" },
      { type: "text", text: " e" },
    ])
  })
  it("turns an unsafe link into plain text", () => {
    const parts = parseInline("[click](javascript:alert(1))")
    expect(parts.some((p) => p.type === "link")).toBe(false)
    expect(parts[0]).toEqual({ type: "text", text: "click" })
  })
  it("leaves HTML as literal text (it is never rendered as markup)", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([{ type: "text", text: "<script>alert(1)</script>" }])
  })
})

describe("parseArticleBody", () => {
  const body = ["## Why it matters", "", "First line", "second line.", "", "- one", "- two", "", "1. step", "2. next", "", "> a quote", "", "### Small heading"].join("\n")
  it("builds headings, joined paragraphs, lists and quotes", () => {
    const blocks = parseArticleBody(body)
    expect(blocks.map((b) => b.type)).toEqual(["h2", "p", "ul", "ol", "quote", "h3"])
    expect(blocks[1]).toEqual({ type: "p", inline: [{ type: "text", text: "First line second line." }] })
    expect(blocks[2]).toMatchObject({ type: "ul", items: [[{ type: "text", text: "one" }], [{ type: "text", text: "two" }]] })
  })
  it("handles Windows line endings and empty input", () => {
    expect(parseArticleBody("## A\r\n\r\ntext")).toHaveLength(2)
    expect(parseArticleBody("")).toEqual([])
  })
})

describe("slugify", () => {
  it("makes tidy slugs", () => {
    expect(slugify("MOT Checklist: 10 things to check!")).toBe("mot-checklist-10-things-to-check")
    expect(slugify("Brakes & Discs — what's normal?")).toBe("brakes-and-discs-what-s-normal")
    expect(slugify("  Café  ")).toBe("cafe")
  })
  it("validates slugs", () => {
    expect(isValidSlug("mot-checklist")).toBe(true)
    expect(isValidSlug("Bad Slug")).toBe(false)
    expect(isValidSlug("-lead")).toBe(false)
  })
})

describe("text helpers", () => {
  it("strips markup for plain text and excerpts", () => {
    expect(plainText("## Hi\n\nSome **bold** text.")).toBe("Hi Some bold text.")
    expect(excerptOf({ excerpt: null, body: "## Hi\n\n" + "word ".repeat(100) }, 40).endsWith("…")).toBe(true)
    expect(excerptOf({ excerpt: "Custom", body: "x" })).toBe("Custom")
  })
  it("estimates reading time, minimum one minute", () => {
    expect(readingMinutes("short")).toBe(1)
    expect(readingMinutes("word ".repeat(660))).toBe(3)
  })
})
