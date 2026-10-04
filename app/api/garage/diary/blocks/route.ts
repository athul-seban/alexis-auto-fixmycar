import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { BookingError } from "@/lib/portal/booking-error"
import { getBusyForRange, summariseConflict } from "@/lib/portal/booking-service"

const MAX_BLOCK_DAYS = 60

const schema = z
  .object({
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    allDay: z.boolean().default(false),
    reason: z.string().trim().max(200).optional(),
    technicianId: z.string().max(40).nullable().optional(),
  })
  .refine((d) => new Date(d.endAt) > new Date(d.startAt), { path: ["endAt"], message: "The end must be after the start" })
  .refine((d) => new Date(d.endAt).getTime() - new Date(d.startAt).getTime() <= MAX_BLOCK_DAYS * 86400000, {
    path: ["endAt"],
    message: `A block can last at most ${MAX_BLOCK_DAYS} days`,
  })

/** Block out time (closure, holiday, training). Existing bookings in the window are reported, never cancelled. */
export const POST = withGarage(
  "Garage diary block POST",
  async (req, { garage }) => {
    const data = schema.parse(await req.json())
    if (data.technicianId) {
      const tech = await prisma.technician.findFirst({ where: { id: data.technicianId, garageId: garage.id } })
      if (!tech) throw new BookingError("INVALID_INPUT", "Technician not found")
    }

    const start = new Date(data.startAt)
    const end = new Date(data.endAt)
    const block = await prisma.diaryBlock.create({
      data: {
        garageId: garage.id,
        technicianId: data.technicianId ?? null,
        startAt: start,
        endAt: end,
        allDay: data.allDay,
        reason: data.reason || null,
      },
      include: { technician: { select: { id: true, name: true, color: true } } },
    })

    // Warn about bookings the new block overlaps (for the whole garage, or that technician).
    const busy = await getBusyForRange(garage.id, start, end)
    const conflicts = busy.bookings.filter((b) => !data.technicianId || b.technicianId === data.technicianId)

    return NextResponse.json(
      {
        block: {
          id: block.id,
          startAt: block.startAt.toISOString(),
          endAt: block.endAt.toISOString(),
          allDay: block.allDay,
          reason: block.reason,
          technician: block.technician,
        },
        conflicts: conflicts.map(summariseConflict),
      },
      { status: 201 }
    )
  },
  { write: true }
)
