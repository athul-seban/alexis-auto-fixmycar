import { describe, it, expect } from "vitest"
import { GET } from "./route"

const call = (query: string) => GET(new Request(`https://qmg.example/api/locale?${query}`))
const location = (res: Response) => res.headers.get("location")

describe("GET /api/locale: redirect target", () => {
  it("sends the visitor back to a same-site path", async () => {
    expect(location(await call("next=%2Fgarages%3Fservice%3DMOT"))).toBe("https://qmg.example/garages?service=MOT")
    expect(location(await call("next=%2Fblog"))).toBe("https://qmg.example/blog")
  })

  it("defaults to the home page", async () => {
    expect(location(await call("l=en"))).toBe("https://qmg.example/")
  })

  it("never redirects off-site, whatever is in `next` (open-redirect regression)", async () => {
    const attacks = [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com", // browsers strip the tab: becomes //evil.com
      "/\n/evil.com",
      "/\r/evil.com",
      "/\u0000/evil.com",
      "javascript:alert(1)",
      "evil.com",
      "",
    ]
    for (const next of attacks) {
      for (const l of ["en", "fr", "nope"]) {
        const res = await call(`l=${l}&next=${encodeURIComponent(next)}`)
        const to = location(res)
        expect(to, `next=${JSON.stringify(next)} l=${l}`).not.toBeNull()
        expect(new URL(to!).origin, `next=${JSON.stringify(next)} l=${l}`).toBe("https://qmg.example")
      }
    }
  })
})

describe("GET /api/locale: language cookie", () => {
  it("remembers a valid language", async () => {
    expect((await call("l=fr&next=%2F")).headers.get("set-cookie")).toMatch(/fr/)
  })

  it("ignores an unknown language", async () => {
    expect((await call("l=xx&next=%2F")).headers.get("set-cookie")).toBeNull()
  })
})
