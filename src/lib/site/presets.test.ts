import { describe, expect, it } from "vitest"
import { STYLE_PRESETS, presetFor } from "@/lib/site/presets"
import { MIN_CONTRAST, contrast, deriveTheme, themeSchema } from "@/lib/site/theme"

describe("style presets", () => {
  it("are valid themes with distinct ids and names", () => {
    expect(STYLE_PRESETS.length).toBeGreaterThanOrEqual(4)
    for (const p of STYLE_PRESETS) expect(themeSchema.safeParse(p.theme).success, p.id).toBe(true)
    expect(new Set(STYLE_PRESETS.map((p) => p.id)).size).toBe(STYLE_PRESETS.length)
    expect(new Set(STYLE_PRESETS.map((p) => p.name)).size).toBe(STYLE_PRESETS.length)
  })

  it("keep every text and background pair readable (4.5:1), whatever the colours", () => {
    for (const p of STYLE_PRESETS) {
      const d = deriveTheme(p.theme)
      expect(contrast(d.onBrand, d.brand), `${p.id} text on brand`).toBeGreaterThanOrEqual(MIN_CONTRAST)
      expect(contrast(d.onAccent, d.accent), `${p.id} text on button`).toBeGreaterThanOrEqual(MIN_CONTRAST)
      expect(contrast(d.brandText, "#FFFFFF"), `${p.id} brand text on white`).toBeGreaterThanOrEqual(MIN_CONTRAST)
      expect(contrast(d.accentText, "#FFFFFF"), `${p.id} accent text on white`).toBeGreaterThanOrEqual(MIN_CONTRAST)
      expect(contrast("#000000", d.brandTint), `${p.id} text on tint`).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
  })

  it("can be recognised from a theme, ignoring the case of the hex codes", () => {
    const racing = STYLE_PRESETS.find((p) => p.id === "racing-red")!
    expect(presetFor(racing.theme)?.id).toBe("racing-red")
    expect(presetFor({ ...racing.theme, brand: racing.theme.brand.toLowerCase() })?.id).toBe("racing-red")
    expect(presetFor({ ...racing.theme, radius: "lg" })).toBeUndefined()
  })
})
