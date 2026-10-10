import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { streamDocument } from "@/lib/garage-documents"

/** Admins download a garage's document to review it. Documents are private: this is the only way anyone but the garage sees one. */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await props.params
  const doc = await prisma.garageDocument.findUnique({ where: { id } })
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })
  return streamDocument(doc.url, doc.name)
}
