import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib"
import { prisma } from "@/lib/prisma"
import { BookingError } from "@/lib/portal/booking-error"
import { formatPhone } from "@/lib/portal/phone"
import { formatLondonDate, londonDateString } from "@/lib/portal/tz"
import { formatCurrency, getServiceLabel } from "@/lib/utils"

export const formatInvoiceNumber = (n: number) => `INV-${String(n).padStart(4, "0")}`

export interface InvoiceModel {
  number: string
  issuedOn: string
  serviceDate: string
  garage: { name: string; address: string; city: string; postcode: string; phone: string; email: string }
  customer: { name: string; email: string | null; phone: string | null }
  vehicle: string
  reference: string | null
  lines: { description: string; amount: number }[]
  total: number
  /** Deposit already paid online and still held (refunded deposits don't count). */
  paid: number
  balanceDue: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

interface InvoiceSource {
  invoiceNumber: string
  invoicedAt: Date
  reference: string | null
  serviceType: string
  description: string | null
  scheduledAt: Date
  completedAt: Date | null
  totalPrice: number
  finalInvoiceValue: number | null
  paymentStatus: string
  depositAmount: number | null
  refundedAmount: number | null
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  vrm: string | null
  vehicleYear: number | null
  vehicleMake: string | null
  vehicleModel: string | null
  garage: { name: string; address: string; city: string; postcode: string; phone: string; email: string }
}

/** Pure: what goes on the invoice. The total is the final invoice value if the garage set one, else the quoted price. */
export function buildInvoiceModel(b: InvoiceSource): InvoiceModel {
  const total = round2(b.finalInvoiceValue ?? b.totalPrice)
  const paid = b.paymentStatus === "PAID" ? round2(Math.max(0, (b.depositAmount ?? 0) - (b.refundedAmount ?? 0))) : 0
  const vehicle = [[b.vehicleYear, b.vehicleMake, b.vehicleModel].filter(Boolean).join(" "), b.vrm].filter(Boolean).join(" · ")
  return {
    number: b.invoiceNumber,
    issuedOn: londonDateString(b.invoicedAt),
    serviceDate: londonDateString(b.completedAt ?? b.scheduledAt),
    garage: b.garage,
    customer: { name: b.customerName ?? "Customer", email: b.customerEmail, phone: b.customerPhone },
    vehicle,
    reference: b.reference,
    lines: [{ description: getServiceLabel(b.serviceType) + (b.description ? ` — ${b.description}` : ""), amount: total }],
    total,
    paid,
    balanceDue: round2(Math.max(0, total - paid)),
  }
}

/**
 * Give a booking its invoice number the first time one is generated; every later call returns the same number. The
 * garage counter and the booking are updated together. Two simultaneous first calls could leave a gap in the
 * sequence (one number consumed, not used) but never a duplicate: the booking is only claimed while it has no number.
 */
export async function ensureInvoiceNumber(bookingId: string, garageId: string): Promise<{ number: string; issuedAt: Date }> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({ where: { id: bookingId, garageId }, select: { invoiceNumber: true, invoicedAt: true, status: true } })
    if (!booking) throw new BookingError("NOT_FOUND", "Booking not found")
    if (booking.invoiceNumber) return { number: booking.invoiceNumber, issuedAt: booking.invoicedAt ?? new Date() }
    if (booking.status !== "COMPLETED") throw new BookingError("INVALID_TRANSITION", "Complete the booking before creating an invoice")

    const { invoiceCounter } = await tx.garage.update({ where: { id: garageId }, data: { invoiceCounter: { increment: 1 } }, select: { invoiceCounter: true } })
    const number = formatInvoiceNumber(invoiceCounter)
    const issuedAt = new Date()
    const claimed = await tx.booking.updateMany({ where: { id: bookingId, invoiceNumber: null }, data: { invoiceNumber: number, invoicedAt: issuedAt } })
    if (claimed.count === 0) {
      const again = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { invoiceNumber: true, invoicedAt: true } })
      return { number: again.invoiceNumber!, issuedAt: again.invoicedAt ?? issuedAt }
    }
    return { number, issuedAt }
  })
}

/** Load a booking and produce its invoice model, assigning the number on first use. */
export async function loadInvoice(bookingId: string, garageId: string): Promise<InvoiceModel> {
  const { number, issuedAt } = await ensureInvoiceNumber(bookingId, garageId)
  const b = await prisma.booking.findFirstOrThrow({ where: { id: bookingId, garageId }, include: { garage: { select: { name: true, address: true, city: true, postcode: true, phone: true, email: true } } } })
  return buildInvoiceModel({ ...b, invoiceNumber: number, invoicedAt: issuedAt })
}

// ───────────────────────────── PDF ─────────────────────────────

const NAVY = rgb(0.118, 0.227, 0.373)
const GREY = rgb(0.4, 0.45, 0.52)
const RULE = rgb(0.85, 0.87, 0.9)

/** The standard PDF fonts only cover Latin-1; anything else (emoji, other scripts) becomes "?" instead of crashing. */
export function pdfSafe(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet())
  let out = ""
  for (const ch of text.replace(/[\r\n\t]+/g, " ")) out += supported.has(ch.codePointAt(0)!) ? ch : "?"
  return out
}

export async function renderInvoicePdf(m: InvoiceModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Invoice ${m.number}`)
  doc.setProducer("Quote My Garage")
  const page = doc.addPage([595.28, 841.89]) // A4
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const left = 50
  const right = 545
  let y = 790
  const text = (s: string, x: number, size = 10, font = regular, color = rgb(0.1, 0.12, 0.16)) => page.drawText(pdfSafe(s, font), { x, y, size, font, color })
  const rightText = (s: string, size = 10, font = regular) => {
    const safe = pdfSafe(s, font)
    page.drawText(safe, { x: right - font.widthOfTextAtSize(safe, size), y, size, font, color: rgb(0.1, 0.12, 0.16) })
  }
  const rule = () => page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.7, color: RULE })

  text(m.garage.name, left, 20, bold, NAVY)
  y -= 16
  for (const line of [m.garage.address, `${m.garage.city} ${m.garage.postcode}`, [formatPhone(m.garage.phone), m.garage.email].filter(Boolean).join(" · ")]) {
    text(line, left, 9.5, regular, GREY)
    y -= 12.5
  }

  // Title block, top right
  const titleY = 790
  page.drawText("INVOICE", { x: right - bold.widthOfTextAtSize("INVOICE", 22), y: titleY, size: 22, font: bold, color: NAVY })
  const meta: [string, string][] = [["Invoice no.", m.number], ["Issued", formatLondonDate(m.issuedOn)], ["Service date", formatLondonDate(m.serviceDate)], ...(m.reference ? ([["Booking ref.", m.reference]] as [string, string][]) : [])]
  let metaY = titleY - 20
  for (const [k, v] of meta) {
    page.drawText(k, { x: right - 170, y: metaY, size: 9, font: regular, color: GREY })
    const safe = pdfSafe(v, bold)
    page.drawText(safe, { x: right - bold.widthOfTextAtSize(safe, 9.5), y: metaY, size: 9.5, font: bold, color: rgb(0.1, 0.12, 0.16) })
    metaY -= 13
  }

  y = Math.min(y, metaY) - 24
  text("BILL TO", left, 8.5, bold, GREY)
  y -= 14
  text(m.customer.name, left, 11, bold)
  y -= 13
  for (const line of [m.customer.email, m.customer.phone ? formatPhone(m.customer.phone) : null, m.vehicle ? `Vehicle: ${m.vehicle}` : null].filter(Boolean) as string[]) {
    text(line, left, 9.5, regular, GREY)
    y -= 12.5
  }

  y -= 18
  page.drawRectangle({ x: left, y: y - 6, width: right - left, height: 22, color: rgb(0.95, 0.96, 0.98) })
  text("Description", left + 8, 9.5, bold, NAVY)
  y -= 0
  const amountLabel = "Amount"
  page.drawText(amountLabel, { x: right - 8 - bold.widthOfTextAtSize(amountLabel, 9.5), y, size: 9.5, font: bold, color: NAVY })
  y -= 26

  for (const l of m.lines) {
    // Wrap long descriptions to the column width.
    const words = pdfSafe(l.description, regular).split(" ")
    let line = ""
    const wrapped: string[] = []
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (regular.widthOfTextAtSize(next, 10) > 370 && line) {
        wrapped.push(line)
        line = w
      } else line = next
    }
    if (line) wrapped.push(line)
    wrapped.forEach((ln, i) => {
      text(ln, left + 8, 10)
      if (i === 0) rightText(formatCurrency(l.amount), 10)
      y -= 14
    })
    y -= 4
  }
  rule()
  y -= 20

  const row = (label: string, value: string, strong = false) => {
    const font = strong ? bold : regular
    page.drawText(label, { x: right - 200, y, size: strong ? 11 : 10, font, color: strong ? NAVY : GREY })
    const safe = pdfSafe(value, font)
    page.drawText(safe, { x: right - font.widthOfTextAtSize(safe, strong ? 11 : 10), y, size: strong ? 11 : 10, font, color: strong ? NAVY : rgb(0.1, 0.12, 0.16) })
    y -= strong ? 18 : 15
  }
  row("Total", formatCurrency(m.total))
  if (m.paid > 0) row("Deposit paid", `-${formatCurrency(m.paid)}`)
  row("Balance due", formatCurrency(m.balanceDue), true)

  y = 70
  page.drawLine({ start: { x: left, y: y + 14 }, end: { x: right, y: y + 14 }, thickness: 0.5, color: RULE })
  page.drawText(pdfSafe(m.balanceDue > 0 ? "Please pay the balance at the garage. Thank you for your custom." : "Paid in full. Thank you for your custom.", regular), { x: left, y, size: 9, font: regular, color: GREY })

  return doc.save()
}
