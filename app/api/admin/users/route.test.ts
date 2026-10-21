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

describe("Admin users route — super admin", () => {
  beforeEach(async () => {
    vi.mocked(sendMail).mockClear()
    await cleanup()
  })
  afterAll(cleanup)

  const make = (name: string, role: string) => prisma.user.create({ data: { email: `${PREFIX}${name}@example.com`, role, password: "hashed-not-real" } })
  const as = (u: { id: string }, role: string) => mockSession.mockResolvedValue({ user: { id: u.id, role } } as any)

  it("lets a super admin make someone an admin", async () => {
    const boss = await make("boss1", "SUPER_ADMIN")
    const target = await make("t1", "OWNER")
    as(boss, "SUPER_ADMIN")

    expect((await PATCH(patchRequest({ userId: target.id, role: "ADMIN" }))).status).toBe(200)
    expect((await prisma.user.findUnique({ where: { id: target.id } }))?.role).toBe("ADMIN")
  })

  it("lets a super admin create another super admin", async () => {
    const boss = await make("boss2", "SUPER_ADMIN")
    const target = await make("t2", "ADMIN")
    as(boss, "SUPER_ADMIN")

    expect((await PATCH(patchRequest({ userId: target.id, role: "SUPER_ADMIN" }))).status).toBe(200)
    expect((await prisma.user.findUnique({ where: { id: target.id } }))?.role).toBe("SUPER_ADMIN")
  })

  it("stops an ordinary admin granting admin or super admin rights, even to themselves", async () => {
    const admin = await make("admin-a", "ADMIN")
    const target = await make("t3", "OWNER")
    as(admin, "ADMIN")

    for (const role of ["ADMIN", "SUPER_ADMIN"]) {
      expect((await PATCH(patchRequest({ userId: target.id, role }))).status).toBe(403)
    }
    // Self-escalation: refused as "can't change your own role" (400), and re-granting ADMIN is still a grant (403).
    expect((await PATCH(patchRequest({ userId: admin.id, role: "SUPER_ADMIN" }))).status).toBe(400)
    expect((await PATCH(patchRequest({ userId: admin.id, role: "ADMIN" }))).status).toBe(403)
    expect((await prisma.user.findUnique({ where: { id: target.id } }))?.role).toBe("OWNER")
    expect((await prisma.user.findUnique({ where: { id: admin.id } }))?.role).toBe("ADMIN")
  })

  it("stops an ordinary admin touching other admin-level accounts", async () => {
    const admin = await make("admin-b", "ADMIN")
    const otherAdmin = await make("admin-c", "ADMIN")
    const boss = await make("boss3", "SUPER_ADMIN")
    as(admin, "ADMIN")

    for (const t of [otherAdmin, boss]) {
      expect((await PATCH(patchRequest({ userId: t.id, suspended: true }))).status).toBe(403)
      expect((await PATCH(patchRequest({ userId: t.id, role: "OWNER" }))).status).toBe(403)
      expect((await DELETE(deleteRequest(t.id))).status).toBe(403)
      expect((await POST(postRequest({ userId: t.id, action: "send_password_reset" }))).status).toBe(403)
    }
    expect(sendMail).not.toHaveBeenCalled()
    expect(await prisma.user.count({ where: { id: { in: [otherAdmin.id, boss.id] } } })).toBe(2)
    expect((await prisma.user.findUnique({ where: { id: boss.id } }))?.suspendedAt).toBeNull()
  })

  it("still lets an ordinary admin manage customers and garages", async () => {
    const admin = await make("admin-d", "ADMIN")
    const owner = await make("t4", "OWNER")
    as(admin, "ADMIN")

    expect((await PATCH(patchRequest({ userId: owner.id, suspended: true }))).status).toBe(200)
    expect((await PATCH(patchRequest({ userId: owner.id, role: "GARAGE" }))).status).toBe(200)
  })

  it("lets a super admin suspend, reset and delete an admin", async () => {
    const boss = await make("boss4", "SUPER_ADMIN")
    const admin = await make("admin-e", "ADMIN")
    as(boss, "SUPER_ADMIN")

    expect((await PATCH(patchRequest({ userId: admin.id, suspended: true }))).status).toBe(200)
    expect((await POST(postRequest({ userId: admin.id, action: "send_password_reset" }))).status).toBe(200)
    expect((await DELETE(deleteRequest(admin.id))).status).toBe(200)
  })

  it("never lets a super admin change, suspend or delete their own account (so the last one can't go)", async () => {
    const boss = await make("boss5", "SUPER_ADMIN")
    as(boss, "SUPER_ADMIN")

    expect((await PATCH(patchRequest({ userId: boss.id, role: "ADMIN" }))).status).toBe(400)
    expect((await PATCH(patchRequest({ userId: boss.id, suspended: true }))).status).toBe(400)
    expect((await DELETE(deleteRequest(boss.id))).status).toBe(400)
    expect((await prisma.user.findUnique({ where: { id: boss.id } }))?.role).toBe("SUPER_ADMIN")
  })

  it("rejects an unknown role", async () => {
    const boss = await make("boss6", "SUPER_ADMIN")
    const target = await make("t5", "OWNER")
    as(boss, "SUPER_ADMIN")
    expect((await PATCH(patchRequest({ userId: target.id, role: "ROOT" }))).status).toBe(400)
  })
})
