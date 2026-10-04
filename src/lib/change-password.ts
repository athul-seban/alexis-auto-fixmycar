import bcrypt from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

export const changePasswordSchema = z.object({
  current: z.string().min(1, "Enter your current password").max(200),
  next: z.string().min(8, "Your new password must be at least 8 characters").max(200),
})

// Same policy as sign-in (src/lib/auth.ts): 5 wrong passwords lock the account for 15 minutes.
const MAX_ATTEMPTS = 5
const LOCK_MS = 15 * 60 * 1000

export interface PasswordChangeResult {
  status: number
  body: { success: true } | { error: string }
}

/**
 * Change a signed-in user's password. The "current password" check is a password-guessing oracle for a
 * hijacked session, so it is rate-limited exactly like login. Shared by the garage and customer portals.
 */
export async function changePassword(userId: string, input: z.infer<typeof changePasswordSchema>): Promise<PasswordChangeResult> {
  const { current, next } = input
  const now = new Date()

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true, failedLoginAttempts: true, lockedUntil: true } })
  if (!user?.password) {
    return { status: 400, body: { error: "Your account signs in with Google, so there's no password to change." } }
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    const mins = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000)
    return { status: 429, body: { error: `Too many incorrect attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` } }
  }

  if (!(await bcrypt.compare(current, user.password))) {
    const attempts = user.failedLoginAttempts + 1
    await prisma.user.update({
      where: { id: userId },
      data: attempts >= MAX_ATTEMPTS ? { failedLoginAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) } : { failedLoginAttempts: attempts },
    })
    return { status: 400, body: { error: "Your current password is incorrect." } }
  }
  if (current === next) {
    return { status: 400, body: { error: "Choose a password you haven't used before." } }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { password: await bcrypt.hash(next, 10), failedLoginAttempts: 0, lockedUntil: null },
  })
  return { status: 200, body: { success: true } }
}
