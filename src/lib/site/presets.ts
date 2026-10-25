import type { SiteTheme } from "@/lib/site/theme"

// Ready-made looks for a business that doesn't want to pick colours. They only fill in the four theme choices; every text colour
// is still derived from them (src/lib/site/theme.ts), so whichever one is picked the text stays readable.

export interface StylePreset {
  id: string
  name: string
  blurb: string
  theme: SiteTheme
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: "navy-orange", name: "Navy and orange", blurb: "Trustworthy and familiar", theme: { brand: "#1E3A5F", accent: "#C2410C", font: "sans", radius: "md" } },
  { id: "racing-red", name: "Racing red and yellow", blurb: "Bold and workmanlike", theme: { brand: "#991B1B", accent: "#F59E0B", font: "sans", radius: "none" } },
  { id: "forest-amber", name: "Forest green and amber", blurb: "Calm and established", theme: { brand: "#14532D", accent: "#B45309", font: "sans", radius: "sm" } },
  { id: "midnight-lime", name: "Midnight and lime", blurb: "Modern and sharp", theme: { brand: "#0F172A", accent: "#65A30D", font: "rounded", radius: "lg" } },
  { id: "charcoal-brick", name: "Charcoal and brick", blurb: "Classic family garage", theme: { brand: "#1F2937", accent: "#B91C1C", font: "serif", radius: "sm" } },
]

/** The preset whose four choices match this theme exactly, if any. */
export const presetFor = (theme: SiteTheme): StylePreset | undefined =>
  STYLE_PRESETS.find((p) => p.theme.brand === theme.brand.toUpperCase() && p.theme.accent === theme.accent.toUpperCase() && p.theme.font === theme.font && p.theme.radius === theme.radius)
