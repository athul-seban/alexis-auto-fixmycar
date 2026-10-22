import { ImageResponse } from "next/og"
import { notFound } from "next/navigation"
import { isTenantLabel } from "@/lib/org/host"
import { getPublicSite } from "@/lib/site/public-cached"
import { deriveTheme } from "@/lib/site/theme"

// The picture shown when a business's site is shared: its name and headline on its brand colour, with text colours
// guaranteed readable by deriveTheme.
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Business website"

export default async function Image({ params }: { params: Promise<{ label: string }> }) {
  const { label } = await params
  if (!isTenantLabel(label)) notFound()
  const result = await getPublicSite(label)
  if (result.state !== "ok") notFound()
  const { site } = result
  const d = deriveTheme(site.theme)
  const city = site.locations[0]?.city

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px", background: d.brand, color: d.onBrand }}>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 800, lineHeight: 1.1 }}>{site.businessName.slice(0, 60)}</div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 38, opacity: 0.92, lineHeight: 1.3 }}>{(site.content.hero.headline || site.content.seo.description).slice(0, 110)}</div>
        <div style={{ display: "flex", marginTop: 48, alignItems: "center" }}>
          <div style={{ display: "flex", background: d.accent, color: d.onAccent, padding: "14px 30px", fontSize: 30, fontWeight: 700, borderRadius: 12 }}>MOT · Servicing · Repairs</div>
          {city ? <div style={{ display: "flex", marginLeft: 28, fontSize: 30, opacity: 0.9 }}>{city}</div> : null}
        </div>
      </div>
    ),
    size
  )
}
