import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { changePassword, changePasswordSchema } from "@/lib/change-password"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const result = await changePassword(userId, changePasswordSchema.parse(await req.json()))
    return NextResponse.json(result.body, { status: result.status })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid data" }, { status: 400 })
    console.error("Account change-password error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
