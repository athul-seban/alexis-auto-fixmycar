import { z } from "zod"

// A business picks two colours, a font and a corner style. Everything else (text on those colours, hover shades, tints) is
// DERIVED so that whatever they choose, text stays readable: WCAG AA needs 4.5:1 for normal text.

const hex6 = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Colours are written like #1E3A5F")
  .transform((v) => v.toUpperCase())

export const FONT_KEYS = ["sans", "serif", "rounded"] as const
export const RADIUS_KEYS = ["none", "sm", "md", "lg"] as const

/** System font stacks: nothing to download, so a site is fast and the font set can't be abused. */
export const FONT_STACKS: Record<(typeof FONT_KEYS)[number], string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, Nunito, "Segoe UI", system-ui, sans-serif',
}

export const RADII: Record<(typeof RADIUS_KEYS)[number], string> = { none: "0px", sm: "6px", md: "12px", lg: "20px" }

export const themeSchema = z.object({
  brand: hex6,
  accent: hex6,
  font: z.enum(FONT_KEYS),
  radius: z.enum(RADIUS_KEYS),
})
export type SiteTheme = z.infer<typeof themeSchema>

/** The platform's own navy and orange, so a site that hasn't been styled still looks like part of the family. */
export const DEFAULT_THEME: SiteTheme = { brand: "#1E3A5F", accent: "#C2410C", font: "sans", radius: "md" }

/** Reads a stored theme; any missing or invalid part falls back to the default rather than breaking the site. */
export function parseTheme(json: string | null | undefined): SiteTheme {
  let raw: unknown = {}
  try {
    raw = JSON.parse(json || "{}")
  } catch {
    /* fall through to defaults */
  }
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const pick = <K extends keyof SiteTheme>(key: K): SiteTheme[K] => {
    const one = themeSchema.shape[key].safeParse(r[key])
    return one.success ? (one.data as SiteTheme[K]) : DEFAULT_THEME[key]
  }
  return { brand: pick("brand"), accent: pick("accent"), font: pick("font"), radius: pick("radius") }
}

// ---- WCAG contrast ---------------------------------------------------------------------------------------------------

const toRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const toHex = (rgb: readonly number[]): string => "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("").toUpperCase()

/** Relative luminance, 0 (black) to 1 (white), as WCAG defines it. */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contrast ratio between two colours, 1 (identical) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export const MIN_CONTRAST = 4.5

/** Mixes `hex` towards `target` by `amount` (0 to 1). */
function mix(hex: string, target: string, amount: number): string {
  const a = toRgb(hex)
  const b = toRgb(target)
  return toHex(a.map((c, i) => c + (b[i] - c) * amount))
}

/** The colour to use as TEXT on a white page: the colour itself if it reads, otherwise darkened until it does. */
export function readableOnWhite(hex: string): string {
  let c = hex
  for (let i = 0; i < 40 && contrast(c, "#FFFFFF") < MIN_CONTRAST; i++) c = mix(c, "#000000", 0.08)
  return contrast(c, "#FFFFFF") >= MIN_CONTRAST ? c : "#000000"
}

/** Black or white, whichever reads better on `hex`. Pure black/white always reaches at least 4.58:1, so this is always legible. */
export function onColour(hex: string): "#FFFFFF" | "#000000" {
  return contrast("#FFFFFF", hex) >= contrast("#000000", hex) ? "#FFFFFF" : "#000000"
}

export interface DerivedTheme {
  brand: string
  /** Text/icons on a brand-coloured surface (buttons, header). */
  onBrand: string
  /** Brand as text on a white page (headings, links). */
  brandText: string
  /** A darker brand for hover and borders. */
  brandDark: string
  /** A very light brand-tinted background for alternating sections. */
  brandTint: string
  accent: string
  onAccent: string
  accentText: string
  accentDark: string
  fontStack: string
  radius: string
}

/** Everything a page needs to paint itself, with every text/background pair guaranteed at least 4.5:1. */
export function deriveTheme(theme: SiteTheme): DerivedTheme {
  return {
    brand: theme.brand,
    onBrand: onColour(theme.brand),
    brandText: readableOnWhite(theme.brand),
    brandDark: mix(theme.brand, "#000000", 0.18),
    brandTint: mix(theme.brand, "#FFFFFF", 0.93),
    accent: theme.accent,
    onAccent: onColour(theme.accent),
    accentText: readableOnWhite(theme.accent),
    accentDark: mix(theme.accent, "#000000", 0.18),
    fontStack: FONT_STACKS[theme.font],
    radius: RADII[theme.radius],
  }
}

/** The CSS custom properties for a site's wrapper element. Only validated values reach here (hex colours, fixed stacks). */
export function themeCssVars(d: DerivedTheme): Record<string, string> {
  return {
    "--brand": d.brand,
    "--on-brand": d.onBrand,
    "--brand-text": d.brandText,
    "--brand-dark": d.brandDark,
    "--brand-tint": d.brandTint,
    "--accent": d.accent,
    "--on-accent": d.onAccent,
    "--accent-text": d.accentText,
    "--accent-dark": d.accentDark,
    "--font": d.fontStack,
    "--radius": d.radius,
  }
}
