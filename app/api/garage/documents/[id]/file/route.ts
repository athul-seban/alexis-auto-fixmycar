import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { streamDocument } from "@/lib/garage-documents"

/** A garage downloading one of its own documents. */
export const GET = withGarage<{ id: string }>("Garage document file GET", async (_req, { garage }, { id }) => {
  const doc = await prisma.garageDocument.findFirst({ where: { id, garageId: garage.id } })
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })
  return streamDocument(doc.url, doc.name)
})
