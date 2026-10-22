import { NextAuthOptions } from "next-auth"
import type { Adapter } from "next-auth/adapters"
import { limitByIp } from "@/lib/rate-limit"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { prisma } from "./prisma"

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000
const SESSION_RECHECK_MS = 60 * 1000
// A valid bcrypt hash (cost 12, same as real passwords) of a throwaway string. Compared against when the email isn't
// registered so that unknown and known emails take the same time to answer. It matches nothing a person could type.
const DUMMY_HASH = "$2a$12$z2Na007PQkdOFVDB.QJfzeJglxw2nsqLGvbMvD9hWxLB1uDwLeScu"

export const authOptions: NextAuthOptions = {
  // @auth/prisma-adapter is typed against the next-auth v5 adapter interface; the v4 `Adapter` is structurally the same.
  adapter: PrismaAdapter(prisma) as Adapter,
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

        // Always run bcrypt, against a throwaway hash when there's no such user (or no password, e.g. Google-only), so
        // the response time doesn't reveal whether an email has an account. And check the password BEFORE saying
        // anything about the account's state: "suspended" and "locked" are only revealed to someone who knows the
        // password, so these messages can't be used to find out which emails are registered.
        const passwordMatch = await bcrypt.compare(credentials.password, user?.password ?? DUMMY_HASH)
        if (!user?.password) return null

        const locked = user.lockedUntil !== null && user.lockedUntil > new Date()

        if (!passwordMatch) {
          // A locked account isn't counted again (the 5th failure already told the visitor).
          if (locked) return null
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

        if (user.suspendedAt) {
          throw new Error("This account has been suspended. Contact support for help.")
        }

        if (locked && user.lockedUntil) {
          const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
          throw new Error(`Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`)
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
        token.role = user.role
        token.id = user.id
      }
      if (token.id) {
        // Re-read the account at most once a minute (always on sign-in / profile update). The database is the source
        // of truth for the role and suspension, so a demoted or suspended user loses access within a minute even
        // though the JWT was minted earlier; it also lets "sign out everywhere" (User.sessionVersion) revoke old
        // tokens and lets name / photo edits show up without signing in again.
        const stale = typeof token.checkedAt !== "number" || Date.now() - token.checkedAt > SESSION_RECHECK_MS
        if (user || trigger === "update" || stale) {
          const fresh = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, suspendedAt: true, sessionVersion: true, name: true, image: true },
          })
          if (!fresh || fresh.suspendedAt) {
            token.invalid = true
          } else {
            if (user || token.sv === undefined) token.sv = fresh.sessionVersion
            token.invalid = token.sv !== fresh.sessionVersion
            token.role = fresh.role
            token.name = fresh.name
            token.picture = fresh.image
          }
          token.checkedAt = Date.now()
        }
      }
      return token
    },
    async session({ session, token }) {
      // A revoked token (suspended or deleted user, "sign out everywhere") must look signed out. An empty session
      // makes getServerSession() return null, so every `if (!session)` guard rejects it. Returning a session with
      // an undefined id instead let routes like /api/notifications run `where: { userId: undefined }`, which Prisma
      // drops, and return every user's rows.
      if (token.invalid || !token.id || !token.role) return {} as typeof session
      if (session.user) {
        session.user.role = token.role
        session.user.id = token.id
        if (token.name !== undefined) session.user.name = token.name as string | null
        if (token.picture !== undefined) session.user.image = token.picture as string | null
      }
      return session
    },
  },
}
