import { ImageResponse } from "next/og"

// Default social-share card for every page without its own. Drawn on request (no binary assets to keep on brand).
export const alt = "Quote My Garage - compare local garages, get quotes and book online"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg, #0F1F3D 0%, #1E3A5F 100%)", color: "#fff" }}>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 800 }}>
          Quote<span style={{ color: "#F97316" }}>MyGarage</span>
        </div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 76, fontWeight: 800, lineHeight: 1.05, maxWidth: 980 }}>Compare local garages. Get quotes. Book online.</div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 32, color: "#BFD3EA" }}>Real reviews from real bookings</div>
      </div>
    ),
    size
  )
}
