import { NextResponse } from "next/server"
import { del, put } from "@vercel/blob"
import { prisma } from "@/lib/prisma"
import { requireGarage } from "@/lib/garage-auth"
import { parseImageList } from "@/lib/garage-mapper"
import { isOwnGarageImageUrl, sniffImageType } from "@/lib/image-sniff"
import { limitByKey } from "@/lib/rate-limit"

const MAX_FILE_SIZE = 5 * 1024 * 1024
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const
const MAX_GARAGE_IMAGES = 8

/** Best-effort removal of a replaced or deleted blob. Never fails the request: an orphaned file is just storage. */
async function removeBlob(url: string | null | undefined, garageId: string) {
  if (!url || !process.env.BLOB_READ_WRITE_TOKEN || !isOwnGarageImageUrl(url, garageId)) return
  await del(url).catch((err) => console.error("[upload] couldn't delete the old image:", err))
}

// Logo and gallery photos are part of a location's profile: profile.edit at the active location, and (like every other
// change) not while the location is suspended.
export async function POST(req: Request) {
  const auth = await requireGarage({ permission: "profile.edit", write: true }, req)
  if (!auth.ok) return auth.response
  const { garage } = auth.ctx

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Image uploads are not configured yet. Set BLOB_READ_WRITE_TOKEN to enable this." },
      { status: 503 }
    )
  }

  try {
    const limited = await limitByKey("garage-upload", garage.id, 40, 60 * 60 * 1000)
    if (limited) return limited

    const formData = await req.formData()
    const file = formData.get("file")
    const kind = formData.get("kind") === "logo" ? "logo" : "gallery"

    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 5MB limit" }, { status: 400 })
    }

    // Trust the bytes, not the browser: file.type and file.name are whatever the client says (an .html file can be
    // sent as image/png). The stored extension and content type both come from the sniffed type.
    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniffImageType(bytes)
    if (!type) return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are allowed" }, { status: 400 })

    const existingImages = parseImageList(garage.images)
    if (kind === "gallery" && existingImages.length >= MAX_GARAGE_IMAGES) {
      return NextResponse.json({ error: `Maximum ${MAX_GARAGE_IMAGES} gallery images allowed` }, { status: 400 })
    }

    const blob = await put(`garages/${garage.id}/${kind}-${Date.now()}.${EXT[type]}`, new Blob([bytes], { type }), {
      access: "public",
      addRandomSuffix: true,
      contentType: type,
    })

    if (kind === "logo") {
      await prisma.garage.update({ where: { id: garage.id }, data: { logo: blob.url } })
      await removeBlob(garage.logo, garage.id)
    } else {
      await prisma.garage.update({
        where: { id: garage.id },
        data: { images: JSON.stringify([...existingImages, blob.url]) },
      })
    }

    return NextResponse.json({ url: blob.url }, { status: 201 })
  } catch (err) {
    console.error("Upload error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const auth = await requireGarage({ permission: "profile.edit", write: true }, req)
  if (!auth.ok) return auth.response
  const { garage } = auth.ctx

  try {
    const url = new URL(req.url).searchParams.get("url")
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })

    // Only an image this garage actually has can be removed: the URL is matched against its own gallery, never trusted.
    const existingImages = parseImageList(garage.images)
    if (!existingImages.includes(url)) return NextResponse.json({ error: "Image not found" }, { status: 404 })

    await prisma.garage.update({
      where: { id: garage.id },
      data: { images: JSON.stringify(existingImages.filter((img) => img !== url)) },
    })
    await removeBlob(url, garage.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Upload delete error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
