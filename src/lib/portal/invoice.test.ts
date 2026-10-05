import { PDFDocument } from "pdf-lib"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { buildInvoiceModel, ensureInvoiceNumber, formatInvoiceNumber, loadInvoice, renderInvoicePdf, type InvoiceModel } from "@/lib/portal/invoice"
import { cleanupPrefix, makeGarage, makeWalkInBooking } from "@/test/fixtures"

const PREFIX = "invoice-"
beforeEach(() => cleanupPrefix(PREFIX))
afterAll(() => cleanupPrefix(PREFIX))

const source = (o: Partial<Parameters<typeof buildInvoiceModel>[0]> = {}): Parameters<typeof buildInvoiceModel>[0] => ({
  invoiceNumber: "INV-0007", invoicedAt: new Date("2026-10-10T12:00:00Z"), reference: "QMG-ABC123", serviceType: "MOT", description: null,
  scheduledAt: new Date("2026-10-09T09:00:00Z"), completedAt: new Date("2026-10-09T11:00:00Z"), totalPrice: 100, finalInvoiceValue: null,
  paymentStatus: "NONE", depositAmount: null, refundedAmount: null, customerName: "Ann Lee", customerEmail: "ann@example.com", customerPhone: "07700900123",
  vrm: "AB12CDE", vehicleYear: 2019, vehicleMake: "Ford", vehicleModel: "Focus",
  garage: { name: "Acme Motors", address: "1 High St", city: "Leeds", postcode: "LS1 1AA", phone: "0113 496 0000", email: "hi@acme.test" }, ...o,
})

describe("formatInvoiceNumber", () => {
  it("pads to four digits and grows past them", () => {
    expect(formatInvoiceNumber(1)).toBe("INV-0001")
    expect(formatInvoiceNumber(12345)).toBe("INV-12345")
  })
})

describe("buildInvoiceModel", () => {
  it("bills the final invoice value when set, else the quoted price", () => {
    expect(buildInvoiceModel(source()).total).toBe(100)
    expect(buildInvoiceModel(source({ finalInvoiceValue: 132.5 })).total).toBe(132.5)
  })
  it("deducts a deposit that is still held, but not a refunded one", () => {
    const held = buildInvoiceModel(source({ paymentStatus: "PAID", depositAmount: 25 }))
    expect(held).toMatchObject({ paid: 25, balanceDue: 75 })
    expect(buildInvoiceModel(source({ paymentStatus: "REFUNDED", depositAmount: 25, refundedAmount: 25 }))).toMatchObject({ paid: 0, balanceDue: 100 })
    expect(buildInvoiceModel(source({ paymentStatus: "PENDING", depositAmount: 25 })).paid).toBe(0) // never paid
  })
  it("never shows a negative balance", () => {
    expect(buildInvoiceModel(source({ finalInvoiceValue: 20, paymentStatus: "PAID", depositAmount: 50 })).balanceDue).toBe(0)
  })
  it("describes the vehicle and customer without inventing details", () => {
    const m = buildInvoiceModel(source({ customerName: null, vehicleYear: null, vehicleMake: null, vehicleModel: null }))
    expect(m.customer.name).toBe("Customer")
    expect(m.vehicle).toBe("AB12CDE")
  })
})

describe("ensureInvoiceNumber", () => {
  it("numbers invoices 1, 2, 3 per garage and is stable once assigned", async () => {
    const { garage } = await makeGarage(PREFIX)
    const a = await makeWalkInBooking(garage.id, { status: "COMPLETED" })
    const b = await makeWalkInBooking(garage.id, { status: "COMPLETED" })
    expect((await ensureInvoiceNumber(a.id, garage.id)).number).toBe("INV-0001")
    expect((await ensureInvoiceNumber(b.id, garage.id)).number).toBe("INV-0002")
    expect((await ensureInvoiceNumber(a.id, garage.id)).number).toBe("INV-0001") // not renumbered
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).invoiceCounter).toBe(2)
  })

  it("keeps each garage's sequence separate", async () => {
    const g1 = await makeGarage(PREFIX, { key: "one" })
    const g2 = await makeGarage(PREFIX, { key: "two" })
    const x = await makeWalkInBooking(g1.garage.id, { status: "COMPLETED" })
    const y = await makeWalkInBooking(g2.garage.id, { status: "COMPLETED" })
    expect((await ensureInvoiceNumber(x.id, g1.garage.id)).number).toBe("INV-0001")
    expect((await ensureInvoiceNumber(y.id, g2.garage.id)).number).toBe("INV-0001")
  })

  it("never hands one booking two different numbers when asked at once", async () => {
    const { garage } = await makeGarage(PREFIX)
    const b = await makeWalkInBooking(garage.id, { status: "COMPLETED" })
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => ensureInvoiceNumber(b.id, garage.id)))
    const numbers = new Set(results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ number: string }>).value.number))
    expect(numbers.size).toBe(1)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).invoiceNumber).toBe([...numbers][0])
  })

  it("leaves no gap in the sequence after a race: the next invoice is the very next number", async () => {
    const { garage } = await makeGarage(PREFIX)
    const first = await makeWalkInBooking(garage.id, { status: "COMPLETED" })
    await Promise.allSettled(Array.from({ length: 6 }, () => ensureInvoiceNumber(first.id, garage.id)))
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).invoiceCounter).toBe(1) // six callers, one number used
    const second = await makeWalkInBooking(garage.id, { status: "COMPLETED" })
    expect((await ensureInvoiceNumber(second.id, garage.id)).number).toBe("INV-0002")
  })

  it("refuses to invoice work that isn't completed, or another garage's booking", async () => {
    const { garage } = await makeGarage(PREFIX, { key: "a" })
    const { garage: other } = await makeGarage(PREFIX, { key: "b" })
    const open = await makeWalkInBooking(garage.id, { status: "CONFIRMED" })
    await expect(ensureInvoiceNumber(open.id, garage.id)).rejects.toMatchObject({ code: "INVALID_TRANSITION" })
    const done = await makeWalkInBooking(garage.id, { status: "COMPLETED" })
    await expect(ensureInvoiceNumber(done.id, other.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).invoiceCounter).toBe(0)
  })
})

describe("renderInvoicePdf", () => {
  const model = async () => {
    const { garage } = await makeGarage(PREFIX)
    const b = await makeWalkInBooking(garage.id, { status: "COMPLETED", totalPrice: 150, finalInvoiceValue: 175.5 })
    return loadInvoice(b.id, garage.id)
  }

  it("produces a one-page A4 PDF", async () => {
    const bytes = await renderInvoicePdf(await model())
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-")
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(Math.round(doc.getPage(0).getWidth())).toBe(595)
    expect(doc.getTitle()).toMatch(/^Invoice INV-/)
  })

  it("survives emoji, non-Latin text, newlines and very long descriptions without throwing", async () => {
    const m: InvoiceModel = {
      ...(await model()),
      customer: { name: "Zoë 🚗 Ångström 山田\nline2", email: "x@example.com", phone: "07700900123" },
      lines: [{ description: "Brake pads ✔ " + "very long description ".repeat(40), amount: 99.99 }],
    }
    const doc = await PDFDocument.load(await renderInvoicePdf(m))
    expect(doc.getPageCount()).toBe(1)
  })
})
