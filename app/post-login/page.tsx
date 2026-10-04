import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { isAllowedForRole, roleHome, safeCallbackUrl } from "@/lib/auth-routes"

export const metadata = { title: "Signing you in" }

// Landing hop after sign-in: send each role to its own dashboard, honouring a safe callback.
export default async function PostLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const role = (session.user as any).role as string | undefined
  const { next } = await searchParams
  const target = safeCallbackUrl(next)

  redirect(target && isAllowedForRole(role, target) ? target : roleHome(role))
}
