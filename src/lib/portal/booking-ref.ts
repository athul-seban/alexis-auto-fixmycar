import { randomInt } from "crypto"

// No 0/O/1/I/L so a reference read out over the phone isn't ambiguous.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const REF_RE = /^QMG-[A-HJKMNP-Z2-9]{6}$/

export function generateReference(): string {
  let s = ""
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)]
  return `QMG-${s}`
}

export function isValidReference(ref: string): boolean {
  return REF_RE.test(ref)
}
