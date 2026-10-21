import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { isAdmin } from "@/lib/roles"
import { loadPricing } from "@/lib/portal/pricing-read"

// Read-only: a garage's prices belong to its owner. Admins can look (to compare listings and moderate) but not edit.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin((session.user as { role?: string }).role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const garage = await prisma.garage.findUnique({ where: { id }, select: { id: true, services: true } })
  if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

  const services = (await loadPricing(garage.id, garage.services)).filter((s) => s.offered)
  return NextResponse.json({ services })
}
