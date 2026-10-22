import type { DefaultSession } from "next-auth"

// What our jwt/session callbacks (src/lib/auth.ts) put on the session. `id` and `role` are always set on a session
// that getServerSession() returns: a revoked token yields no session at all.
declare module "next-auth" {
  interface Session {
    user?: NonNullable<DefaultSession["user"]> & { id: string; role: string }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: string
    /** Set when the account is suspended, deleted, or its sessionVersion moved on. */
    invalid?: boolean
    /** sessionVersion the token was minted against. */
    sv?: number
    /** When the account was last re-read from the database. */
    checkedAt?: number
  }
}
