import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { BookingError } from "@/lib/portal/booking-error"

export const DELETE = withGarage<{ id: string }>(
  "Garage diary block DELETE",
  async (_req, { garage }, { id }) => {
    const block = await prisma.diaryBlock.findFirst({ where: { id, garageId: garage.id }, select: { id: true } })
    if (!block) throw new BookingError("NOT_FOUND", "Block not found")
    await prisma.diaryBlock.delete({ where: { id } })
    return NextResponse.json({ success: true })
  },
  { write: true }
)
