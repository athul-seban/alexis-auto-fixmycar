import { NextResponse } from "next/server"
import { z } from "zod"
import { withGarage } from "@/lib/garage-auth"
import { BookingError } from "@/lib/portal/booking-error"
import { recordBookingEvent } from "@/lib/portal/booking-events"
import { loadInvoice, renderInvoicePdf } from "@/lib/portal/invoice"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { invoiceCustomerEmail } from "@/lib/email-templates"
import { formatCurrency } from "@/lib/utils"

type Params = { id: string }

/** Download the invoice PDF. The first request for a completed booking assigns its invoice number. */
export const GET = withGarage<Params>("Garage invoice GET", async (_req, { garage }, { id }) => {
  const invoice = await loadInvoice(id, garage.id)
  const pdf = await renderInvoicePdf(invoice)
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
})

const emailSchema = z.object({ to: z.string().trim().toLowerCase().email("Enter a valid email address").max(200).optional() })

/** Email the invoice to the customer (their email on the booking, or an address the garage types). */
export const POST = withGarage<Params>(
  "Garage invoice POST",
  async (req, { garage }, { id }) => {
    const { to } = emailSchema.parse(await req.json().catch(() => ({})))
    const invoice = await loadInvoice(id, garage.id)
    const recipient = to ?? invoice.customer.email
    if (!recipient) throw new BookingError("INVALID_INPUT", "This customer has no email address — enter one to send the invoice.")

    const pdf = await renderInvoicePdf(invoice)
    const result = await sendMail({
      to: recipient,
      ...invoiceCustomerEmail({
        garageName: garage.name,
        customerName: invoice.customer.name,
        invoiceNumber: invoice.number,
        total: formatCurrency(invoice.total),
        balanceDue: formatCurrency(invoice.balanceDue),
        serviceType: (await prisma.booking.findUniqueOrThrow({ where: { id }, select: { serviceType: true } })).serviceType,
      }),
      attachments: [{ filename: `${invoice.number}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" }],
    })
    if (!result.success) return NextResponse.json({ error: "The email couldn't be sent. Try again, or download the PDF instead." }, { status: 502 })

    await recordBookingEvent(prisma, { bookingId: id, actorType: "GARAGE", type: "NOTE", detail: `Invoice ${invoice.number} emailed to ${recipient}` })
    return NextResponse.json({ sent: true, to: recipient, number: invoice.number, skipped: result.skipped ?? false })
  },
  { write: true }
)
