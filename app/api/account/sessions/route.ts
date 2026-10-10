import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

/** "Sign out everywhere": bumps sessionVersion so every existing token (checked in the jwt callback) is rejected. */
export async function DELETE() {
  const session = await getServerSession(authOptions)
  const id = (session?.user as { id?: string } | undefined)?.id
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  await prisma.user.update({ where: { id }, data: { sessionVersion: { increment: 1 } } })
  return NextResponse.json({ success: true })
}
