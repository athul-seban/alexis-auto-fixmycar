import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { ALLOWED_DOCUMENT_TYPES, cleanFileName, isDocumentKind, MAX_DOCUMENT_BYTES, MAX_DOCUMENTS_PER_GARAGE } from "@/lib/garage-documents"

const SELECT = { id: true, kind: true, name: true, status: true, note: true, createdAt: true, reviewedAt: true } as const

export const GET = withGarage("Garage documents GET", async (_req, { garage }) => {
  const documents = await prisma.garageDocument.findMany({ where: { garageId: garage.id }, orderBy: { createdAt: "desc" }, select: SELECT })
  return NextResponse.json({ documents, uploadsAvailable: Boolean(process.env.BLOB_READ_WRITE_TOKEN) })
})

export const POST = withGarage(
  "Garage documents POST",
  async (req, { garage }) => {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "Document uploads aren't set up on this platform yet." }, { status: 503 })
    }
    const form = await req.formData()
    const file = form.get("file")
    const kind = form.get("kind")
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload" }, { status: 400 })
    if (!isDocumentKind(kind)) return NextResponse.json({ error: "Choose what kind of document this is" }, { status: 400 })
    const ext = ALLOWED_DOCUMENT_TYPES[file.type]
    if (!ext) return NextResponse.json({ error: "Upload a PDF, JPEG, PNG or WebP file" }, { status: 400 })
    if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: "Files can be at most 8MB" }, { status: 400 })
    if ((await prisma.garageDocument.count({ where: { garageId: garage.id } })) >= MAX_DOCUMENTS_PER_GARAGE) {
      return NextResponse.json({ error: `You can keep up to ${MAX_DOCUMENTS_PER_GARAGE} documents — delete an old one first.` }, { status: 400 })
    }

    const blob = await put(`garage-documents/${garage.id}/${kind.toLowerCase()}.${ext}`, file, { access: "private", addRandomSuffix: true })
    const document = await prisma.garageDocument.create({
      data: { garageId: garage.id, kind, name: cleanFileName(file.name), url: blob.url },
      select: SELECT,
    })
    return NextResponse.json({ document }, { status: 201 })
  },
  { write: true }
)

/** Remove one of your own documents (approved ones too — the garage stays verified until an admin says otherwise). */
export const DELETE = withGarage(
  "Garage documents DELETE",
  async (req, { garage }) => {
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
    const res = await prisma.garageDocument.deleteMany({ where: { id, garageId: garage.id } })
    if (res.count === 0) return NextResponse.json({ error: "Document not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  },
  { write: true }
)
