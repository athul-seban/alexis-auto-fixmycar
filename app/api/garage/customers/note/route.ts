import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"

const schema = z.object({
  key: z.string().regex(/^[epvu]:[^\s]{1,190}$/, "Invalid customer"),
  body: z.string().trim().max(2000, "Notes can be at most 2000 characters"),
})

/** Save (or, when empty, delete) the garage's private note about a customer. */
export const PUT = withGarage(
  "Garage customer note PUT",
  async (req, { garage }) => {
    const { key, body } = schema.parse(await req.json())
    const where = { garageId_customerKey: { garageId: garage.id, customerKey: key } }
    if (!body) {
      await prisma.customerNote.deleteMany({ where: { garageId: garage.id, customerKey: key } })
      return NextResponse.json({ note: null })
    }
    const note = await prisma.customerNote.upsert({ where, create: { garageId: garage.id, customerKey: key, body }, update: { body } })
    return NextResponse.json({ note: { body: note.body, updatedAt: note.updatedAt.toISOString() } })
  },
  { write: true }
)
