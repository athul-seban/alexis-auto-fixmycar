import { describe, expect, it } from "vitest"
import { isOwnAvatarUrl, isOwnBlobUrl, isOwnGarageImageUrl, sniffFileType, sniffImageType } from "./image-sniff"

const bytes = (...n: number[]) => new Uint8Array(n)

describe("sniffImageType", () => {
  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg")
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png")
    expect(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp")
  })
  it("rejects anything else, whatever its extension or declared type", () => {
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull()
    expect(sniffImageType(new TextEncoder().encode("GIF89a......"))).toBeNull()
    expect(sniffImageType(bytes())).toBeNull()
  })
})

describe("sniffFileType", () => {
  it("adds PDF to the image types", () => {
    expect(sniffFileType(new TextEncoder().encode("%PDF-1.7\n%âãÏÓ"))).toBe("application/pdf")
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff))).toBe("image/jpeg")
  })
  it("rejects scripts and HTML dressed up as documents", () => {
    expect(sniffFileType(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull()
    expect(sniffFileType(new TextEncoder().encode("PK\u0003\u0004"))).toBeNull() // zip/docx
    expect(sniffFileType(new TextEncoder().encode("%PD"))).toBeNull()
  })
})

describe("isOwnBlobUrl / isOwnGarageImageUrl", () => {
  it("accepts only the garage's own folder in Vercel Blob over https", () => {
    expect(isOwnGarageImageUrl("https://x.public.blob.vercel-storage.com/garages/g1/logo-1.png", "g1")).toBe(true)
    expect(isOwnGarageImageUrl("https://x.public.blob.vercel-storage.com/garages/g2/logo-1.png", "g1")).toBe(false)
    expect(isOwnGarageImageUrl("https://x.public.blob.vercel-storage.com/users/g1/logo-1.png", "g1")).toBe(false)
    expect(isOwnGarageImageUrl("https://evil.example/garages/g1/logo.png", "g1")).toBe(false)
    expect(isOwnGarageImageUrl("https://x.public.blob.vercel-storage.com.evil.example/garages/g1/a.png", "g1")).toBe(false)
  })
  it("can't be tricked with path traversal or a prefix-sharing id", () => {
    // ".." is resolved by URL parsing before the prefix check
    expect(isOwnGarageImageUrl("https://x.public.blob.vercel-storage.com/garages/g1/../g2/a.png", "g1")).toBe(false)
    expect(isOwnGarageImageUrl("https://x.public.blob.vercel-storage.com/garages/g10/a.png", "g1")).toBe(false)
    expect(isOwnBlobUrl("https://x.public.blob.vercel-storage.com/orgs/o1/logo.png", "orgs/o1/")).toBe(true)
  })
})

describe("isOwnAvatarUrl", () => {
  it("accepts only the user's own folder in Vercel Blob over https", () => {
    expect(isOwnAvatarUrl("https://x.public.blob.vercel-storage.com/users/u1/avatar.png", "u1")).toBe(true)
    expect(isOwnAvatarUrl("https://x.public.blob.vercel-storage.com/users/u2/avatar.png", "u1")).toBe(false)
    expect(isOwnAvatarUrl("http://x.public.blob.vercel-storage.com/users/u1/a.png", "u1")).toBe(false)
    expect(isOwnAvatarUrl("https://evil.example/users/u1/a.png", "u1")).toBe(false)
    expect(isOwnAvatarUrl("not a url", "u1")).toBe(false)
  })
})
