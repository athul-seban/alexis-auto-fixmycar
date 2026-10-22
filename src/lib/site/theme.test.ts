import { describe, expect, it } from "vitest"
import { DEFAULT_THEME, MIN_CONTRAST, contrast, deriveTheme, luminance, onColour, parseTheme, readableOnWhite, themeCssVars, themeSchema } from "./theme"

// A small deterministic generator so the "for any colour" checks cover the whole colour cube without a dependency.
function* colours(n: number): Generator<string> {
  let s = 123456789
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s
  }
  for (const c of ["#000000", "#FFFFFF", "#808080", "#767676", "#757575", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#1E3A5F", "#F97316", "#777777", "#595959", "#949494"]) yield c
  for (let i = 0; i < n; i++) yield "#" + (next() & 0xffffff).toString(16).padStart(6, "0").toUpperCase()
}

describe("contrast maths", () => {
  it("matches the WCAG reference values", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5)
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5)
    expect(contrast("#767676", "#FFFFFF")).toBeGreaterThan(4.5) // the well-known lightest grey that passes on white
    expect(contrast("#777777", "#FFFFFF")).toBeLessThan(4.5)
    expect(luminance("#000000")).toBe(0)
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 5)
  })
})

describe("deriveTheme: text is readable on whatever colours a business picks", () => {
  it("text on the brand and accent colours is at least 4.5:1, for any colour", () => {
    for (const c of colours(4000)) {
      const d = deriveTheme({ brand: c, accent: c, font: "sans", radius: "md" })
      expect(contrast(d.onBrand, d.brand), `on ${c}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
      expect(contrast(d.onAccent, d.accent), `on ${c}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
  })

  it("brand and accent used as text on a white page are at least 4.5:1, for any colour", () => {
    for (const c of colours(4000)) {
      const d = deriveTheme({ brand: c, accent: c, font: "sans", radius: "md" })
      expect(contrast(d.brandText, "#FFFFFF"), `brandText for ${c}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
      expect(contrast(d.accentText, "#FFFFFF"), `accentText for ${c}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
  })

  it("leaves a colour alone when it already reads on white, and only darkens otherwise", () => {
    expect(readableOnWhite("#1E3A5F")).toBe("#1E3A5F")
    const fixed = readableOnWhite("#FFEE00")
    expect(fixed).not.toBe("#FFEE00")
    expect(luminance(fixed)).toBeLessThan(luminance("#FFEE00"))
  })

  it("picks white on dark colours and black on light ones", () => {
    expect(onColour("#1E3A5F")).toBe("#FFFFFF")
    expect(onColour("#FFEE00")).toBe("#000000")
    expect(onColour("#000000")).toBe("#FFFFFF")
    expect(onColour("#FFFFFF")).toBe("#000000")
  })

  it("derives shades that stay valid colours", () => {
    for (const c of colours(300)) {
      const d = deriveTheme({ brand: c, accent: c, font: "serif", radius: "lg" })
      for (const k of ["brand", "onBrand", "brandText", "brandDark", "brandTint", "accent", "onAccent", "accentText", "accentDark"] as const) expect(d[k], `${k} of ${c}`).toMatch(/^#[0-9A-F]{6}$/)
      expect(luminance(d.brandDark)).toBeLessThanOrEqual(luminance(d.brand))
      expect(luminance(d.brandTint)).toBeGreaterThanOrEqual(luminance(d.brand))
    }
  })

  it("the default theme is itself accessible", () => {
    const d = deriveTheme(DEFAULT_THEME)
    expect(contrast(d.onBrand, d.brand)).toBeGreaterThanOrEqual(MIN_CONTRAST)
    expect(contrast(d.accentText, "#FFFFFF")).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })
})

describe("themeSchema and parseTheme", () => {
  it("accepts only six-digit hex colours and the fixed font and corner choices", () => {
    expect(themeSchema.safeParse({ brand: "#1e3a5f", accent: "#f97316", font: "serif", radius: "lg" })).toMatchObject({ success: true, data: { brand: "#1E3A5F" } })
    for (const bad of [
      { brand: "red", accent: "#F97316", font: "sans", radius: "md" },
      { brand: "#123", accent: "#F97316", font: "sans", radius: "md" },
      { brand: "#12345G", accent: "#F97316", font: "sans", radius: "md" },
      { brand: "url(javascript:alert(1))", accent: "#F97316", font: "sans", radius: "md" },
      { brand: "#1E3A5F; background:url(x)", accent: "#F97316", font: "sans", radius: "md" },
      { brand: "#1E3A5F", accent: "#F97316", font: "Comic Sans", radius: "md" },
      { brand: "#1E3A5F", accent: "#F97316", font: "sans", radius: "50%" },
    ]) {
      expect(themeSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
    }
  })

  it("falls back to the default for anything stored that is missing or bad, field by field", () => {
    expect(parseTheme(null)).toEqual(DEFAULT_THEME)
    expect(parseTheme("not json")).toEqual(DEFAULT_THEME)
    expect(parseTheme("[]")).toEqual(DEFAULT_THEME)
    expect(parseTheme(JSON.stringify({ brand: "#00FF00", accent: "nope", font: "rounded" }))).toEqual({ ...DEFAULT_THEME, brand: "#00FF00", font: "rounded" })
  })
})

describe("themeCssVars", () => {
  it("emits only validated colours, the fixed font stacks and fixed radii", () => {
    const vars = themeCssVars(deriveTheme({ brand: "#1E3A5F", accent: "#F97316", font: "serif", radius: "sm" }))
    for (const [k, v] of Object.entries(vars)) {
      expect(k).toMatch(/^--[a-z-]+$/)
      expect(v, k).not.toMatch(/[;{}<>]|url\(|expression/i)
    }
    expect(vars["--radius"]).toBe("6px")
  })
})
