import { describe, expect, it } from "vitest"
import { isOwnAvatarUrl, sniffImageType } from "./image-sniff"

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

describe("isOwnAvatarUrl", () => {
  it("accepts only the user's own folder in Vercel Blob over https", () => {
    expect(isOwnAvatarUrl("https://x.public.blob.vercel-storage.com/users/u1/avatar.png", "u1")).toBe(true)
    expect(isOwnAvatarUrl("https://x.public.blob.vercel-storage.com/users/u2/avatar.png", "u1")).toBe(false)
    expect(isOwnAvatarUrl("http://x.public.blob.vercel-storage.com/users/u1/a.png", "u1")).toBe(false)
    expect(isOwnAvatarUrl("https://evil.example/users/u1/a.png", "u1")).toBe(false)
    expect(isOwnAvatarUrl("not a url", "u1")).toBe(false)
  })
})
