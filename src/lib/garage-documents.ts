import { get } from "@vercel/blob"

export * from "@/lib/garage-documents-shared"

// Verification paperwork a garage uploads (insurance, trade certificates, ID) for an admin to review. Stored as PRIVATE
// blobs: the URL on its own opens nothing, and the file is only streamed through routes that check who is asking.

export const ALLOWED_DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}


/** Strip a user-supplied file name down to something safe to store and show: no path parts, no control characters. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ""
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim()
  return (cleaned || "document").slice(0, 120)
}

/** Stream a stored private document back as a download-safe response. */
export async function streamDocument(url: string, fileName: string): Promise<Response> {
  const blob = await get(url, { access: "private" })
  if (!blob || blob.statusCode !== 200) return new Response("Not found", { status: 404 })
  return new Response(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType,
      // Always a download, never rendered inline from our origin, whatever the file claims to be.
      "Content-Disposition": `attachment; filename="${cleanFileName(fileName).replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
