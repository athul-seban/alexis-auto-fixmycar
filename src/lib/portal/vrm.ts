/** "ab12 cde" → "AB12CDE". Used for storage and filtering so "ab12 cde" finds "AB12CDE". */
export function normaliseVrm(input: string | null | undefined): string {
  return (input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
}

export function isPlausibleVrm(input: string | null | undefined): boolean {
  const v = normaliseVrm(input)
  return v.length >= 2 && v.length <= 8
}

/** Display form: the current UK format gets its customary space ("AB12CDE" → "AB12 CDE"). */
export function formatVrm(input: string | null | undefined): string {
  const v = normaliseVrm(input)
  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(v)) return `${v.slice(0, 4)} ${v.slice(4)}`
  return v
}
