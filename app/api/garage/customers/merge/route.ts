import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { BookingError } from "@/lib/portal/booking-error"
import { buildCustomers, canMerge, resolveKey } from "@/lib/portal/customers"
import { loadCustomerRows, loadRedirects } from "@/lib/portal/customers-db"

const KEY = z.string().regex(/^[epvu]:[^\s]{1,190}$/, "Invalid customer")
const MAX_NOTE = 2000

/** Merge customer `from` into `to` ("these are the same person"). The private note on `from` moves across. */
export const POST = withGarage(
  "Garage customer merge POST",
  async (req, { garage }) => {
    const { from, to } = z.object({ from: KEY, to: KEY }).parse(await req.json())

    const [rows, redirects] = await Promise.all([loadCustomerRows(garage.id), loadRedirects(garage.id)])
    // Both sides must be real customers of THIS garage as they are grouped right now.
    const keys = new Set(buildCustomers(rows, new Date(), redirects).map((c) => c.key))
    const source = resolveKey(from, redirects)
    const target = resolveKey(to, redirects)
    if (!keys.has(source) || !keys.has(target)) throw new BookingError("NOT_FOUND", "Customer not found")
    if (!canMerge(source, target, redirects)) throw new BookingError("INVALID_INPUT", "Those are already the same customer")

    await prisma.$transaction(async (tx) => {
      await tx.customerMerge.upsert({
        where: { garageId_fromKey: { garageId: garage.id, fromKey: source } },
        create: { garageId: garage.id, fromKey: source, toKey: target },
        update: { toKey: target },
      })
      const [a, b] = await Promise.all([
        tx.customerNote.findUnique({ where: { garageId_customerKey: { garageId: garage.id, customerKey: source } } }),
        tx.customerNote.findUnique({ where: { garageId_customerKey: { garageId: garage.id, customerKey: target } } }),
      ])
      if (a) {
        const body = (b ? `${b.body}\n\n${a.body}` : a.body).slice(0, MAX_NOTE)
        await tx.customerNote.upsert({
          where: { garageId_customerKey: { garageId: garage.id, customerKey: target } },
          create: { garageId: garage.id, customerKey: target, body },
          update: { body },
        })
        await tx.customerNote.delete({ where: { id: a.id } })
      }
    })
    return NextResponse.json({ key: target })
  },
  { write: true }
)

/** Undo a merge: `?from=<key>` splits that identity back out as its own customer. */
export const DELETE = withGarage(
  "Garage customer merge DELETE",
  async (req, { garage }) => {
    const from = KEY.parse(new URL(req.url).searchParams.get("from"))
    const removed = await prisma.customerMerge.deleteMany({ where: { garageId: garage.id, fromKey: from } })
    if (removed.count === 0) throw new BookingError("NOT_FOUND", "That customer isn't merged")
    return NextResponse.json({ key: from })
  },
  { write: true }
)
