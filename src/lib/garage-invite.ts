import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { absoluteUrl } from "@/lib/portal/links"
import { escapeHtml as e } from "@/lib/utils"

// A garage invited by a super admin has a login but no password. The owner sets one from an emailed link, which is
// an ordinary reset-password token (POST /api/auth/reset-password accepts a user with no password yet), just valid
// for a week instead of an hour. The super admin never sees the link or the password.

export const INVITE_VALID_DAYS = 7

export interface InviteResult {
  /** False when email isn't configured (local dev) or the send failed. */
  sent: boolean
  /** Only outside production, so tests and local dev can follow the link. Never returned in production. */
  devUrl?: string
}

export async function sendGarageInvite(owner: { email: string; name: string | null }, garageName: string): Promise<InviteResult> {
  const token = crypto.randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000)
  await prisma.verificationToken.deleteMany({ where: { identifier: owner.email } })
  await prisma.verificationToken.create({ data: { identifier: owner.email, token, expires } })

  const url = `${process.env.NEXTAUTH_URL ?? absoluteUrl("")}/reset-password?token=${token}`
  const mail = await sendMail({
    to: owner.email,
    subject: `Set up ${garageName} on Quote My Garage`,
    html: `
      <p>Hi ${e(owner.name ?? "there")},</p>
      <p>${e(garageName)} has been added to Quote My Garage. Choose a password to open your garage portal, then complete your profile: address, services, opening hours and prices.</p>
      <p><a href="${url}">Set your password</a></p>
      <p>This link works for ${INVITE_VALID_DAYS} days. Your garage goes live once our team has checked your profile.</p>
    `,
  })
  return { sent: mail.success && !mail.skipped, ...(process.env.NODE_ENV !== "production" ? { devUrl: url } : {}) }
}
