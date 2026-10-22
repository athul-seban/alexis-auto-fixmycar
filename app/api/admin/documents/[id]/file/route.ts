import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { streamDocument } from "@/lib/garage-documents"
import { requireAdmin } from "@/lib/admin-auth"

/** Admins download a garage's document to review it. Documents are private: this is the only way anyone but the garage sees one. */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await props.params
  const doc = await prisma.garageDocument.findUnique({ where: { id } })
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })
  return streamDocument(doc.url, doc.name)
}
