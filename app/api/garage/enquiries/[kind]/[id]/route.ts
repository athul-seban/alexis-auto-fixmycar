import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { BookingError } from "@/lib/portal/booking-error"
import { garageCanSeeJob } from "@/lib/portal/enquiries"

type Params = { kind: string; id: string }

const patchSchema = z
  .object({ contacted: z.boolean().optional(), ignored: z.boolean().optional() })
  .refine((d) => d.contacted !== undefined || d.ignored !== undefined, "Nothing to update")

/**
 * Work an enquiry without answering it: mark the customer contacted, or ignore/decline it.
 *  - QUOTE: contacted -> Quote.contactedAt; ignored -> status REJECTED (only while still unpriced)
 *  - JOB:   stored per garage in GarageLead (created lazily; "new" means no row)
 */
export const PATCH = withGarage<Params>(
  "Garage enquiry PATCH",
  async (req, { garage }, { kind, id }) => {
    const data = patchSchema.parse(await req.json())
    const now = new Date()

    if (kind === "quote") {
      const quote = await prisma.quote.findFirst({ where: { id, garageId: garage.id } })
      if (!quote) throw new BookingError("NOT_FOUND", "Enquiry not found")

      const update: { contactedAt?: Date | null; status?: string } = {}
      if (data.contacted !== undefined) update.contactedAt = data.contacted ? (quote.contactedAt ?? now) : null
      if (data.ignored === true) {
        if (quote.status !== "PENDING") throw new BookingError("CONFLICT", "Only an unanswered request can be declined")
        update.status = "REJECTED"
      } else if (data.ignored === false && quote.status === "REJECTED") {
        update.status = "PENDING"
      }
      await prisma.quote.update({ where: { id }, data: update })
      return NextResponse.json({ ok: true })
    }

    if (kind === "job") {
      if (!(await garageCanSeeJob(garage, id))) throw new BookingError("NOT_FOUND", "Enquiry not found")
      const lead = await prisma.garageLead.findUnique({ where: { garageId_jobRequestId: { garageId: garage.id, jobRequestId: id } } })

      const contactedAt = data.contacted === undefined ? (lead?.contactedAt ?? null) : data.contacted ? (lead?.contactedAt ?? now) : null
      const ignored = data.ignored === undefined ? lead?.status === "IGNORED" : data.ignored

      if (!ignored && !contactedAt) {
        // Back to a pristine "new" lead: no row at all.
        if (lead) await prisma.garageLead.delete({ where: { id: lead.id } })
      } else {
        const row = { status: ignored ? "IGNORED" : "CONTACTED", contactedAt }
        await prisma.garageLead.upsert({
          where: { garageId_jobRequestId: { garageId: garage.id, jobRequestId: id } },
          create: { garageId: garage.id, jobRequestId: id, ...row },
          update: row,
        })
      }
      return NextResponse.json({ ok: true })
    }

    throw new BookingError("NOT_FOUND", "Unknown enquiry type")
  },
  { write: true }
)
