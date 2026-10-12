// UK VAT registration numbers. Format check only (it cannot tell whether HMRC has issued the number).

/** "gb 123 4567 89" → "GB123456789". Returns "" for empty input. */
export function normaliseVat(input: string | null | undefined): string {
  return (input ?? "").toUpperCase().replace(/[\s\-.]/g, "")
}

/**
 * Accepted shapes, with or without the GB prefix: 9 digits, 12 digits (branch traders), GD + 3 digits (government
 * departments) and HA + 3 digits (health authorities).
 */
export function isValidUkVat(input: string | null | undefined): boolean {
  const v = normaliseVat(input)
  return /^(GB)?(\d{9}|\d{12})$/.test(v) || /^(GB)?(GD|HA)\d{3}$/.test(v)
}

/** Canonical stored form: "GB" + number. */
export function formatVat(input: string | null | undefined): string {
  const v = normaliseVat(input)
  if (!v) return ""
  return v.startsWith("GB") ? v : `GB${v}`
}
