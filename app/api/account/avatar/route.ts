import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { del, put } from "@vercel/blob"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { limitByIp } from "@/lib/rate-limit"
import { isOwnAvatarUrl } from "@/lib/image-sniff"
import { sniffImageType } from "@/lib/image-sniff"

const MAX_FILE_SIZE = 2 * 1024 * 1024
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }

/** Upload the signed-in user's profile photo (any role) and store its URL on User.image. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const id = (session?.user as { id?: string } | undefined)?.id
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Photo uploads are not configured yet." }, { status: 503 })
  }
  const limited = await limitByIp(req.headers, "avatar-upload", 20, 60 * 60 * 1000)
  if (limited) return limited

  try {
    const file = (await req.formData()).get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Photo must be under 2MB" }, { status: 400 })

    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniffImageType(bytes)
    if (!type || !EXT[type]) return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are allowed" }, { status: 400 })

    const previous = (await prisma.user.findUnique({ where: { id }, select: { image: true } }))?.image ?? null
    const blob = await put(`users/${id}/avatar.${EXT[type]}`, new Blob([bytes], { type }), { access: "public", addRandomSuffix: true, contentType: type })
    await prisma.user.update({ where: { id }, data: { image: blob.url } })
    if (previous && isOwnAvatarUrl(previous, id)) await del(previous).catch((err) => console.error("[avatar] couldn't delete the old photo:", err))
    return NextResponse.json({ url: blob.url }, { status: 201 })
  } catch (err) {
    console.error("Avatar upload error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
