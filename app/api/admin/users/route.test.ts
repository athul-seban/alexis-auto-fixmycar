import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { sendMail } from "@/lib/mail"
import { PATCH, DELETE, POST } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "usertest-"

async function cleanup() {
  await prisma.booking.deleteMany({ where: { vehicle: { registration: `${PREFIX}REG` } } })
  await prisma.vehicle.deleteMany({ where: { registration: `${PREFIX}REG` } })
  await prisma.garage.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function deleteRequest(userId: string) {
  return new Request(`http://localhost/api/admin/users?userId=${userId}`, { method: "DELETE" })
}

describe("Admin users route — permission guards", () => {
  beforeEach(cleanup)
  afterAll(cleanup)

  it("rejects a non-admin session on PATCH", async () => {
    const target = await prisma.user.create({ data: { email: `${PREFIX}target@example.com`, role: "OWNER" } })
    mockSession.mockResolvedValue({ user: { id: "someone", role: "OWNER" } } as any)

    const res = await PATCH(patchRequest({ userId: target.id, suspended: true }))
    expect(res.status).toBe(401)
  })

  it("prevents an admin from suspending themselves", async () => {
    const admin = await prisma.user.create({ data: { email: `${PREFIX}admin@example.com`, role: "ADMIN" } })
    mockSession.mockResolvedValue({ user: { id: admin.id, role: "ADMIN" } } as any)

    const res = await PATCH(patchRequest({ userId: admin.id, suspended: true }))
    expect(res.status).toBe(400)

    const reloaded = await prisma.user.findUnique({ where: { id: admin.id } })
    expect(reloaded?.suspendedAt).toBeNull()
  })

  it("prevents an admin from demoting themselves away from ADMIN", async () => {
    const admin = await prisma.user.create({ data: { email: `${PREFIX}admin2@example.com`, role: "ADMIN" } })
    mockSession.mockResolvedValue({ user: { id: admin.id, role: "ADMIN" } } as any)

    const res = await PATCH(patchRequest({ userId: admin.id, role: "OWNER" }))
    expect(res.status).toBe(400)

    const reloaded = await prisma.user.findUnique({ where: { id: admin.id } })
    expect(reloaded?.role).toBe("ADMIN")
  })

  it("allows an admin to suspend a different user", async () => {
    const admin = await prisma.user.create({ data: { email: `${PREFIX}admin3@example.com`, role: "ADMIN" } })
    const target = await prisma.user.create({ data: { email: `${PREFIX}target2@example.com`, role: "OWNER" } })
    mockSession.mockResolvedValue({ user: { id: admin.id, role: "ADMIN" } } as any)

    const res = await PATCH(patchRequest({ userId: target.id, suspended: true }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.user.suspended).toBe(true)
  })

  it("allows an admin to change another user's role", async () => {
    const admin = await prisma.user.create({ data: { email: `${PREFIX}admin4@example.com`, role: "ADMIN" } })
    const target = await prisma.user.create({ data: { email: `${PREFIX}target3@example.com`, role: "OWNER" } })
    mockSession.mockResolvedValue({ user: { id: admin.id, role: "ADMIN" } } as any)

    const res = await PATCH(patchRequest({ userId: target.id, role: "GARAGE" }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.user.role).toBe("GARAGE")
  })

  it("prevents an admin from deleting themselves", async () => {
    const admin = await prisma.user.create({ data: { email: `${PREFIX}admin5@example.com`, role: "ADMIN" } })
    mockSession.mockResolvedValue({ user: { id: admin.id, role: "ADMIN" } } as any)

    const res = await DELETE(deleteRequest(admin.id))
    expect(res.status).toBe(400)

    const stillExists = await prisma.user.findUnique({ where: { id: admin.id } })
    expect(stillExists).not.toBeNull()
  })

  it("returns 409 when deleting a user with related records instead of deleting", async () => {
    const admin = await prisma.user.create({ data: { email: `${PREFIX}admin6@example.com`, role: "ADMIN" } })
    const owner = await prisma.user.create({ data: { email: `${PREFIX}owner-with-vehicle@example.com`, role: "OWNER" } })
    const garageUser = await prisma.user.create({ data: { email: `${PREFIX}garage-for-booking@example.com`, role: "GARAGE" } })
    const garage = await prisma.garage.create({
      data: {
        userId: garageUser.id,
        name: `${PREFIX}BookingGarage`,
        slug: `${PREFIX}booking-garage-${Date.now()}`,
        phone: "0123456789",
        email: "g@example.com",
        address: "1 St",
        city: "Bristol",
        postcode: "BS1 1AA",
        status: "APPROVED",
      },
    })
    const vehicle = await prisma.vehicle.create({
      data: { ownerId: owner.id, registration: `${PREFIX}REG`, make: "Ford", model: "Focus", year: 2020 },
    })
    // Bookings don't cascade-delete with their owner (unlike Vehicle), so this is what actually
    // triggers the FK-violation guard in the route.
    await prisma.booking.create({
      data: {
        ownerId: owner.id,
        vehicleId: vehicle.id,
        garageId: garage.id,
        serviceType: "MOT",
        status: "PENDING",
        scheduledAt: new Date(),
        totalPrice: 50,
      },
    })
    mockSession.mockResolvedValue({ user: { id: admin.id, role: "ADMIN" } } as any)

    const res = await DELETE(deleteRequest(owner.id))
    expect(res.status).toBe(409)

    const stillExists = await prisma.user.findUnique({ where: { id: owner.id } })
    expect(stillExists).not.toBeNull()
  })

  it("deletes a user cleanly when there are no related records", async () => {
    const admin = await prisma.user.create({ data: { email: `${PREFIX}admin7@example.com`, role: "ADMIN" } })
    const target = await prisma.user.create({ data: { email: `${PREFIX}lonely@example.com`, role: "OWNER" } })
    mockSession.mockResolvedValue({ user: { id: admin.id, role: "ADMIN" } } as any)

    const res = await DELETE(deleteRequest(target.id))
    expect(res.status).toBe(200)

    const stillExists = await prisma.user.findUnique({ where: { id: target.id } })
    expect(stillExists).toBeNull()
  })

  it("refuses to send a password reset for a user without a password (OAuth-only)", async () => {
    const admin = await prisma.user.create({ data: { email: `${PREFIX}admin8@example.com`, role: "ADMIN" } })
    const target = await prisma.user.create({ data: { email: `${PREFIX}oauth-only@example.com`, role: "OWNER" } })
    mockSession.mockResolvedValue({ user: { id: admin.id, role: "ADMIN" } } as any)

    const res = await POST(postRequest({ userId: target.id, action: "send_password_reset" }))
    expect(res.status).toBe(400)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("sends a password reset email for a password-based user", async () => {
    const admin = await prisma.user.create({ data: { email: `${PREFIX}admin9@example.com`, role: "ADMIN" } })
    const target = await prisma.user.create({
      data: { email: `${PREFIX}has-password@example.com`, role: "OWNER", password: "hashed-not-real" },
    })
    mockSession.mockResolvedValue({ user: { id: admin.id, role: "ADMIN" } } as any)

    const res = await POST(postRequest({ userId: target.id, action: "send_password_reset" }))
    expect(res.status).toBe(200)
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: target.email }))
  })
})
