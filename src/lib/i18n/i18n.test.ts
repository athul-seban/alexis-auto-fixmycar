import { describe, expect, it } from "vitest"
import { isTranslatedPath, languageAlternates, localePath, splitLocalePath } from "./config"
import { DEFAULT_MESSAGES, MESSAGE_KEYS, buildMessages, clientMessages, interpolate, makeTranslator } from "./messages"
import { isBodyKey, validateContent } from "./content-rules"

describe("locale paths", () => {
  it("prefixes only translated pages and only for non-English", () => {
    expect(localePath("en", "/how-it-works")).toBe("/how-it-works")
    expect(localePath("fr", "/")).toBe("/fr")
    expect(localePath("de", "/how-it-works")).toBe("/de/how-it-works")
    expect(localePath("fr", "/garages?x=1")).toBe("/fr/garages?x=1")
    expect(localePath("fr", "/search")).toBe("/search") // not translated
    expect(localePath("fr", "/garages/leeds")).toBe("/garages/leeds") // city pages are English only
    expect(localePath("fr", "https://example.com")).toBe("https://example.com")
    expect(localePath("fr", "//evil.example")).toBe("//evil.example")
  })

  it("splits a locale prefix off a pathname", () => {
    expect(splitLocalePath("/fr")).toEqual({ locale: "fr", path: "/" })
    expect(splitLocalePath("/de/for-garages")).toEqual({ locale: "de", path: "/for-garages" })
    expect(splitLocalePath("/frankfurt")).toEqual({ locale: null, path: "/frankfurt" })
    expect(splitLocalePath("/search")).toEqual({ locale: null, path: "/search" })
  })

  it("knows which pages are translated", () => {
    for (const p of ["/", "/how-it-works", "/for-garages", "/garages", "/privacy", "/terms", "/cookies"]) expect(isTranslatedPath(p)).toBe(true)
    for (const p of ["/search", "/login", "/garages/leeds", "/admin"]) expect(isTranslatedPath(p)).toBe(false)
  })

  it("builds hreflang alternates including x-default", () => {
    const alt = languageAlternates("/how-it-works", "https://qmg.test")
    expect(alt).toEqual({
      "en-GB": "https://qmg.test/how-it-works",
      fr: "https://qmg.test/fr/how-it-works",
      de: "https://qmg.test/de/how-it-works",
      "x-default": "https://qmg.test/how-it-works",
    })
  })
})

describe("messages", () => {
  const tokens = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

  it("French and German define every key, and only keep a value empty where English does", () => {
    for (const l of ["fr", "de"] as const) {
      for (const k of MESSAGE_KEYS) {
        expect(DEFAULT_MESSAGES[l][k], `${l} is missing ${k}`).toBeDefined()
        if (DEFAULT_MESSAGES.en[k].trim() !== "") expect(DEFAULT_MESSAGES[l][k].trim(), `${l}.${k} is empty`).not.toBe("")
        else expect(DEFAULT_MESSAGES[l][k].trim(), `${l}.${k} should stay empty (optional field)`).toBe("")
      }
    }
  })

  it("keeps the same {placeholders} in every language, so no translation drops a value", () => {
    for (const l of ["fr", "de"] as const) for (const k of MESSAGE_KEYS) expect(tokens(DEFAULT_MESSAGES[l][k]), `${l}.${k}`).toEqual(tokens(DEFAULT_MESSAGES.en[k]))
  })

  it("contains none of the claims that used to be invented", () => {
    const all = Object.values(DEFAULT_MESSAGES).flatMap((m) => Object.values(m)).join("\n")
    for (const bad of ["15,000", "50,000", "500K", "£110", "£2,500", "48 hours", "48hrs", "300+", "no monthly fees"]) expect(all.toLowerCase()).not.toContain(bad.toLowerCase())
  })

  it("applies published overrides on top of the language's own text, ignoring unknown or empty ones", () => {
    const m = buildMessages("fr", { "hero.title1": "Surcharge", "does.not.exist": "x", "hero.title2": "   " })
    expect(m["hero.title1"]).toBe("Surcharge")
    expect(m["hero.title2"]).toBe(DEFAULT_MESSAGES.fr["hero.title2"])
    expect((m as Record<string, string>)["does.not.exist"]).toBeUndefined()
    // another language is untouched
    expect(buildMessages("de", {})["hero.title1"]).toBe(DEFAULT_MESSAGES.de["hero.title1"])
  })

  it("interpolates placeholders and leaves unknown ones visible", () => {
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}")
    expect(makeTranslator(DEFAULT_MESSAGES.en)("stats.ratingSub", { n: 12 })).toBe("Across 12 reviews")
  })

  it("ships only the strings client components use", () => {
    const keys = Object.keys(clientMessages(DEFAULT_MESSAGES.en))
    expect(keys).toContain("nav.signIn")
    expect(keys).toContain("hero.submit")
    expect(keys.some((k) => k.startsWith("legal."))).toBe(false)
    expect(keys.some((k) => k.startsWith("footer."))).toBe(false)
  })
})

describe("content rules", () => {
  it("accepts ordinary text and empty values, rejects unknown keys and oversized text", () => {
    expect(validateContent("hero.title1", "Find great garages")).toBeNull()
    expect(validateContent("footer.phone", "")).toBeNull()
    expect(validateContent("nope.nope", "x")).toMatch(/Unknown/)
    expect(validateContent("hero.title1", "x".repeat(2001))).toMatch(/Too long/)
    expect(validateContent("legal.privacy.body", "x".repeat(2001))).toBeNull() // legal bodies may be long
    expect(isBodyKey("legal.terms.body")).toBe(true)
    expect(isBodyKey("legal.terms.title")).toBe(false)
  })

  it("validates contact details and links", () => {
    expect(validateContent("footer.email", "hello@example.co.uk")).toBeNull()
    expect(validateContent("footer.email", "not an email")).toMatch(/email/)
    expect(validateContent("footer.phone", "020 7946 0000")).toBeNull()
    expect(validateContent("footer.phone", "call me")).toMatch(/phone/)
    expect(validateContent("footer.social.facebook", "https://facebook.com/qmg")).toBeNull()
    expect(validateContent("footer.social.facebook", "javascript:alert(1)")).toMatch(/https/)
    expect(validateContent("site.noticeLink", "/how-it-works")).toBeNull()
    expect(validateContent("site.noticeLink", "//evil.example")).toMatch(/web address/)
    expect(validateContent("site.noticeLink", "javascript:alert(1)")).toMatch(/web address/)
  })
})
