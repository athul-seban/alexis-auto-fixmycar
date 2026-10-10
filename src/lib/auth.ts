import { NextAuthOptions } from "next-auth"
import { limitByIp } from "@/lib/rate-limit"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { prisma } from "./prisma"

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        // Per-visitor brake on top of the per-account lockout below (which can't stop one IP trying many accounts).
        const limited = await limitByIp(new Headers(req?.headers as Record<string, string> | undefined), "login", 30, 10 * 60 * 1000)
        if (limited) throw new Error("Too many sign-in attempts. Please wait a few minutes and try again.")

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
        })

        if (!user || !user.password) return null

        if (user.suspendedAt) {
          throw new Error("This account has been suspended. Contact support for help.")
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
          throw new Error(`Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`)
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user.password
        )

        if (!passwordMatch) {
          const attempts = user.failedLoginAttempts + 1
          const lockingOut = attempts >= MAX_FAILED_ATTEMPTS
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: lockingOut ? 0 : attempts,
              lockedUntil: lockingOut ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
            },
          })
          if (lockingOut) {
            throw new Error("Too many failed attempts. Try again in 15 minutes.")
          }
          return null
        }

        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
          })
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
      }
      if (token.id) {
        // One light read per session check: lets "sign out everywhere" (User.sessionVersion) revoke old tokens,
        // and lets name / photo edits show up without signing in again.
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { sessionVersion: true, name: true, image: true },
        })
        if (!fresh) {
          token.invalid = true
        } else {
          if (user || token.sv === undefined) token.sv = fresh.sessionVersion
          token.invalid = token.sv !== fresh.sessionVersion
          if (trigger === "update" || user) {
            token.name = fresh.name
            token.picture = fresh.image
          }
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        // A revoked token yields a session with no id/role, so every guard treats it as signed out.
        (session.user as any).role = token.invalid ? undefined : token.role
        ;(session.user as any).id = token.invalid ? undefined : token.id
        if (token.name !== undefined) session.user.name = token.name as string | null
        if (token.picture !== undefined) session.user.image = token.picture as string | null
      }
      return session
    },
  },
}
