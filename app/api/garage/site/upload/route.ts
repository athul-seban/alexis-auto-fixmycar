import { NextResponse } from "next/server"
import { del, put } from "@vercel/blob"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { OrgError } from "@/lib/org/org-error"
import { isOwnOrgImageUrl, sniffImageType } from "@/lib/image-sniff"
import { limitByKey } from "@/lib/rate-limit"
import { ensureSite, setLogo } from "@/lib/site/site-service"

const MAX_FILE_SIZE = 2 * 1024 * 1024 // a website image: 2 MB is plenty and keeps the pages quick
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const

/**
 * Upload a website image: the logo, the hero photo or a gallery photo. Stored under orgs/<business id>/ (the only place the
 * site may point at). JPEG, PNG and WebP only: the type is read from the file's bytes, never from its name or the browser's
 * claim, and SVG is refused (it can carry script). The logo is saved against the site straight away; a hero or gallery
 * photo is just stored and its address returned, to be placed on the page and saved with the draft.
 */
export const POST = withGarage(
  "Garage site upload POST",
  async (req, ctx) => {
    requireFeature(ctx, "sites")
    const org = ctx.organisation
    if (!org) throw new OrgError("CONFLICT", "This garage hasn't been set up as a business yet.")
    if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Image uploads are not configured yet. Set BLOB_READ_WRITE_TOKEN to enable this." }, { status: 503 })

    const limited = await limitByKey("site-upload", org.id, 40, 60 * 60 * 1000)
    if (limited) return limited

    const form = await req.formData()
    const file = form.get("file")
    const kind = form.get("kind") === "logo" ? "logo" : form.get("kind") === "hero" ? "hero" : "gallery"
    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Images can be at most 2 MB" }, { status: 400 })

    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniffImageType(bytes)
    if (!type) return NextResponse.json({ error: "Only JPEG, PNG or WebP images are allowed" }, { status: 400 })

    const blob = await put(`orgs/${org.id}/${kind}-${Date.now()}.${EXT[type]}`, new Blob([bytes], { type }), { access: "public", addRandomSuffix: true, contentType: type })

    if (kind === "logo") {
      const site = await ensureSite(org.id, org.name)
      const previous = site.logo
      const { version } = await setLogo(ctx, blob.url)
      // The replaced logo is no longer used anywhere: remove it (best effort; an orphan is only storage).
      if (previous && isOwnOrgImageUrl(previous, org.id)) await del(previous).catch((err) => console.error("[site upload] couldn't delete the old logo:", err))
      return NextResponse.json({ url: blob.url, version }, { status: 201 })
    }
    return NextResponse.json({ url: blob.url }, { status: 201 })
  },
  { permission: "website.edit", write: true }
)
