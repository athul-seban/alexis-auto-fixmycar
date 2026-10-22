import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { loadPricing } from "@/lib/portal/pricing-read"
import { requireAdmin } from "@/lib/admin-auth"

// Read-only: a garage's prices belong to its owner. Admins can look (to compare listings and moderate) but not edit.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const garage = await prisma.garage.findUnique({ where: { id }, select: { id: true, services: true } })
  if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

  const services = (await loadPricing(garage.id, garage.services)).filter((s) => s.offered)
  return NextResponse.json({ services })
}
