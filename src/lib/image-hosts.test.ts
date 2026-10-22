import { describe, expect, it } from "vitest"
import { canOptimise } from "@/lib/image-hosts"

const HOSTS = "images.unsplash.com, *.public.blob.vercel-storage.com ,lh3.googleusercontent.com"

describe("canOptimise", () => {
  it("accepts https images on a listed host, and on any subdomain of a wildcard entry", () => {
    expect(canOptimise("https://images.unsplash.com/photo-1?w=100", HOSTS)).toBe(true)
    expect(canOptimise("https://abc123.public.blob.vercel-storage.com/orgs/o1/logo.png", HOSTS)).toBe(true)
    expect(canOptimise("https://LH3.GoogleUserContent.com/a", HOSTS)).toBe(true)
  })

  it("refuses everything else, so a stray URL stays a plain <img> instead of crashing next/image", () => {
    for (const src of [
      "http://images.unsplash.com/a.jpg", // not https
      "https://evil.example.com/a.jpg",
      "https://images.unsplash.com.evil.com/a.jpg", // look-alike suffix
      "https://evilimages.unsplash.com.evil.com/a.jpg",
      "https://public.blob.vercel-storage.com/a.png", // the wildcard needs a subdomain
      "https://notpublic.blob.vercel-storage.com.evil.com/a.png",
      "/relative.png",
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
      "not a url",
      "",
    ]) {
      expect(canOptimise(src, HOSTS), src).toBe(false)
    }
  })

  it("optimises nothing when no list is configured, or for an empty source", () => {
    expect(canOptimise("https://images.unsplash.com/a.jpg", "")).toBe(false)
    expect(canOptimise("https://images.unsplash.com/a.jpg", undefined)).toBe(false)
    expect(canOptimise(null, HOSTS)).toBe(false)
    expect(canOptimise(undefined, HOSTS)).toBe(false)
  })
})
