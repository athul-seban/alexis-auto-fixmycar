import { ImageResponse } from "next/og"
import { prisma } from "@/lib/prisma"

// Per-garage share card: name, location and the real rating. Falls back to a plain brand card if the garage isn't public.
export const alt = "Garage on Quote My Garage"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await prisma.garage
    .findFirst({ where: { OR: [{ id }, { slug: id }], status: "APPROVED" }, select: { name: true, city: true, averageRating: true, totalReviews: true } })
    .catch(() => null)

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg, #0F1F3D 0%, #1E3A5F 100%)", color: "#fff" }}>
        <div style={{ display: "flex", fontSize: 36, fontWeight: 800 }}>
          Quote<span style={{ color: "#F97316" }}>MyGarage</span>
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: g && g.name.length > 32 ? 64 : 80, fontWeight: 800, lineHeight: 1.05, maxWidth: 1000 }}>{g?.name ?? "Find a trusted local garage"}</div>
        {g && <div style={{ display: "flex", marginTop: 24, fontSize: 38, color: "#BFD3EA" }}>{g.city}</div>}
        {g && g.totalReviews > 0 && (
          <div style={{ display: "flex", marginTop: 20, fontSize: 38, color: "#FBBF24", fontWeight: 700 }}>
            {g.averageRating.toFixed(1)} / 5 <span style={{ color: "#BFD3EA", fontWeight: 400, marginLeft: 14 }}>{g.totalReviews} review{g.totalReviews === 1 ? "" : "s"}</span>
          </div>
        )}
      </div>
    ),
    size
  )
}
