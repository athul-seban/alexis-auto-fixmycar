import { describe, expect, it } from "vitest"
import { RESERVED_LABELS, SUBDOMAIN_MAX, normaliseLabel, parseLabel, subdomainProblem, suggestLabel } from "./subdomain"

describe("subdomainProblem", () => {
  it("accepts ordinary labels", () => {
    for (const ok of ["acme", "acme-motors", "york-mot-centre", "a1-garage", "abc", "x".repeat(SUBDOMAIN_MAX)]) expect(subdomainProblem(ok), ok).toBeNull()
  })

  it("enforces length", () => {
    expect(subdomainProblem("ab")).toMatch(/at least 3/)
    expect(subdomainProblem("x".repeat(SUBDOMAIN_MAX + 1))).toMatch(/at most 40/)
  })

  it("is ASCII-only, so look-alike letters from other alphabets can't pass (homograph)", () => {
    for (const bad of ["аpple-motors", "gооgle-garage", "acmé", "ａｃｍｅ", "acme​motors", "日本"]) expect(subdomainProblem(bad), bad).not.toBeNull()
  })

  it("is one DNS label with a safe shape", () => {
    for (const bad of ["acme.motors", "-acme", "acme-", "acme--motors", "xn--acme", "acme_motors", "acme motors", "acme/", "acme:80", "a@b", "ACME"]) {
      expect(subdomainProblem(bad), bad).not.toBeNull()
    }
  })

  it("refuses numbers-only labels", () => {
    expect(subdomainProblem("12345")).toMatch(/letter/)
  })

  it("refuses reserved words and names built on them", () => {
    for (const word of ["www", "admin", "api", "login", "mail", "widget", "blog", "billing", "support", "app", "stripe", "dvsa"]) {
      expect(RESERVED_LABELS.has(word), word).toBe(true)
      expect(subdomainProblem(word), word).not.toBeNull()
    }
    for (const trick of ["admin-login", "my-stripe-pay", "secure-acme", "official-acme-motors", "acme-support"]) expect(subdomainProblem(trick), trick).not.toBeNull()
    expect(subdomainProblem("acme-supporters-club")).toBeNull() // only whole words count
  })
})

describe("normaliseLabel / parseLabel", () => {
  it("lower-cases and tidies what a person types", () => {
    expect(normaliseLabel("  Acme Motors ")).toBe("acme-motors")
    expect(normaliseLabel("acme___motors")).toBe("acme-motors")
    expect(normaliseLabel("Acme--Motors")).toBe("acme-motors")
  })

  it("returns the label or the reason", () => {
    expect(parseLabel("Acme Motors")).toEqual({ ok: true, label: "acme-motors" })
    expect(parseLabel("Admin")).toMatchObject({ ok: false })
    expect(parseLabel("x")).toMatchObject({ ok: false })
  })

  it("judges what was typed, so tidying can't turn a punycode prefix into an allowed label", () => {
    expect(parseLabel("xn--acme")).toMatchObject({ ok: false })
    expect(parseLabel("  XN--acme")).toMatchObject({ ok: false })
    expect(parseLabel("xn-acme")).toEqual({ ok: true, label: "xn-acme" }) // a single hyphen is an ordinary label
  })
})

describe("suggestLabel", () => {
  it("turns a business name into something usable", () => {
    expect(suggestLabel("Acme Motors Ltd.")).toBe("acme-motors")
    expect(suggestLabel("Café & Garage Limited")).toBe("cafe-and-garage")
    expect(suggestLabel("  --Premier Auto Services--  ")).toBe("premier-auto-services")
  })

  it("never exceeds the maximum and never ends on a hyphen", () => {
    const s = suggestLabel("An Extremely Long Garage Business Name That Goes On And On And On Forever")
    expect(s.length).toBeLessThanOrEqual(SUBDOMAIN_MAX)
    expect(s.endsWith("-")).toBe(false)
  })

  it("can produce something that still needs fixing (reserved or too short); callers must check it", () => {
    expect(subdomainProblem(suggestLabel("Admin"))).not.toBeNull()
    expect(suggestLabel("!!")).toBe("")
  })
})
