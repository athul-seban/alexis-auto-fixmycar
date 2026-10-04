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
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role
        ;(session.user as any).id = token.id
      }
      return session
    },
  },
}
