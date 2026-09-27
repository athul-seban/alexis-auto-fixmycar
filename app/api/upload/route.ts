import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { put } from "@vercel/blob"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { parseImageList } from "@/lib/garage-mapper"

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_GARAGE_IMAGES = 8

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "GARAGE") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Image uploads are not configured yet. Set BLOB_READ_WRITE_TOKEN to enable this." },
      { status: 503 }
    )
  }

  try {
    const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
    if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

    const formData = await req.formData()
    const file = formData.get("file")
    const kind = formData.get("kind") === "logo" ? "logo" : "gallery"

    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are allowed" }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 5MB limit" }, { status: 400 })
    }

    const existingImages = parseImageList(garage.images)
    if (kind === "gallery" && existingImages.length >= MAX_GARAGE_IMAGES) {
      return NextResponse.json({ error: `Maximum ${MAX_GARAGE_IMAGES} gallery images allowed` }, { status: 400 })
    }

    const ext = file.name.split(".").pop() ?? "jpg"
    const pathname = `garages/${garage.id}/${kind}-${Date.now()}.${ext}`

    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: true,
    })

    if (kind === "logo") {
      await prisma.garage.update({ where: { id: garage.id }, data: { logo: blob.url } })
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
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "GARAGE") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
    if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

    const { searchParams } = new URL(req.url)
    const url = searchParams.get("url")
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })

    const existingImages = parseImageList(garage.images)
    await prisma.garage.update({
      where: { id: garage.id },
      data: { images: JSON.stringify(existingImages.filter((img) => img !== url)) },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Upload delete error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
