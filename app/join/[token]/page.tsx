import Link from "next/link"
import { getServerSession } from "next-auth"
import { Wrench } from "lucide-react"
import { authOptions } from "@/lib/auth"
import { JoinInvite } from "@/components/org/JoinInvite"
import { previewInvite } from "@/lib/org/staff-service"

// The emailed staff-invitation link. Private to whoever holds the token: not indexed, and the token never leaves in a
// Referer header.
export const metadata = { title: "Join a garage team", robots: { index: false, follow: false }, referrer: "no-referrer" as const }
export const dynamic = "force-dynamic"

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [preview, session] = await Promise.all([previewInvite(token), getServerSession(authOptions)])

  return (
    <div role="main" className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1E3A5F]">
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-[#1E3A5F]">
              Quote<span className="text-[#C2410C]">MyGarage</span>
            </span>
          </Link>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
          <JoinInvite token={token} preview={preview} signedInEmail={session?.user?.email ?? null} />
        </div>
      </div>
    </div>
  )
}
