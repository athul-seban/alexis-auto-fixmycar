/** The real type from the file's first bytes; the browser-supplied `file.type` can say anything. */
export function sniffImageType(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png"
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp"
  return null
}

/** True for a Vercel Blob URL under users/<id>/ — the only place avatars are stored. */
export function isOwnAvatarUrl(url: string, userId: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com") && u.pathname.startsWith(`/users/${userId}/`)
  } catch {
    return false
  }
}
