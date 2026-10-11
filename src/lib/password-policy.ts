import { z } from "zod"

// Not a full strength meter: it blocks the passwords attackers try first. Length matters more than symbols.
const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "12345678", "123456789", "1234567890", "11111111",
  "00000000", "qwertyui", "qwertyuiop", "qwerty123", "1q2w3e4r", "iloveyou", "letmein1", "welcome1", "welcome123",
  "abc12345", "abcd1234", "admin123", "administrator", "football", "monkey123", "dragon123", "changeme", "changeme1",
])

/** Why a password is unacceptable, or null if it is fine. */
export function passwordProblem(pw: string, context: { email?: string | null; name?: string | null } = {}): string | null {
  if (pw.length < 8) return "Your password must be at least 8 characters"
  if (pw.length > 100) return "Your password must be 100 characters or fewer"
  const lower = pw.toLowerCase()
  if (COMMON.has(lower)) return "That password is too common. Choose something harder to guess"
  if (/^(.)\1+$/.test(pw)) return "Your password can't be one repeated character"
  const local = context.email?.split("@")[0]?.toLowerCase()
  if (local && local.length >= 4 && lower.includes(local)) return "Your password shouldn't contain your email name"
  return null
}

/** Zod field for a new password. Pass the user's email/name via `passwordProblem` where it is known. */
export const newPasswordSchema = z.string().max(100).superRefine((pw, ctx) => {
  const problem = passwordProblem(pw)
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem })
})
