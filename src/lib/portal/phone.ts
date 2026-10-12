// UK phone helpers. Numbers are stored as typed; these normalise for display/export/search.

/** "+44 7700 900123" / "0044 7700 900123" / "07700-900123" → "07700900123". */
export function normalisePhone(input: string | null | undefined): string {
  if (!input) return ""
  let s = input.replace(/[\s\-().]/g, "")
  if (s.startsWith("+44")) s = "0" + s.slice(3)
  else if (s.startsWith("0044")) s = "0" + s.slice(4)
  return s
}

/** "07700900123" → "07700 900123" (mobiles); anything else is returned as normalised. */
export function formatPhone(input: string | null | undefined): string {
  const n = normalisePhone(input)
  if (/^07\d{9}$/.test(n)) return `${n.slice(0, 5)} ${n.slice(5)}`
  return n
}

/** A plausible UK number of any kind: 10-11 digits after the leading 0 (landline, mobile, 03/08 business lines). */
export function isValidUkPhone(input: string | null | undefined): boolean {
  return /^0[1-9]\d{8,9}$/.test(normalisePhone(input))
}

/** A UK mobile (07xxx xxxxxx), the only kind that can receive booking texts. */
export function isValidUkMobile(input: string | null | undefined): boolean {
  return toE164Mobile(input) !== null
}

/**
 * UK number → E.164 ("+447700900123") for the SMS provider, or null when it isn't a plausible UK mobile.
 * Only mobiles can receive texts, so landlines (01/02/03) and malformed numbers are rejected rather than paid for.
 */
export function toE164Mobile(input: string | null | undefined): string | null {
  const n = normalisePhone(input)
  return /^07\d{9}$/.test(n) ? `+44${n.slice(1)}` : null
}
