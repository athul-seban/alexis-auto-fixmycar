import { ImageResponse } from "next/og"

// App icons for the installable web app, drawn on request so there are no binary assets to keep in step with the brand.
// /icons/192 and /icons/512; add ?maskable=1 for the full-bleed version Android crops into a circle or squircle.
const SIZES = new Set(["192", "512"])

export async function GET(req: Request, props: { params: Promise<{ size: string }> }) {
  const { size } = await props.params
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 })
  const px = Number(size)
  const maskable = new URL(req.url).searchParams.get("maskable") === "1"
  // Maskable icons keep the artwork inside the central 80% "safe zone".
  const glyph = Math.round(px * (maskable ? 0.42 : 0.56))

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1E3A5F",
          borderRadius: maskable ? 0 : Math.round(px * 0.22),
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", color: "#ffffff", fontSize: glyph, fontWeight: 800, letterSpacing: -2 }}>
          Q<span style={{ color: "#F97316" }}>G</span>
        </div>
      </div>
    ),
    { width: px, height: px, headers: { "Cache-Control": "public, max-age=86400, immutable" } }
  )
}
