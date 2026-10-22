import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { RemoteImage } from "./remote-image"

// Only the fallback path is exercised here: next/image itself needs the build's image config. Which hosts take the optimised
// path is covered by src/lib/image-hosts.test.ts.

afterEach(() => vi.unstubAllEnvs())

describe("RemoteImage", () => {
  it("is a plain lazy <img> with the same class when no host list is configured", () => {
    render(<RemoteImage src="https://images.unsplash.com/a.jpg" alt="Workshop" width={100} height={50} className="rounded" />)
    const img = screen.getByRole("img", { name: "Workshop" })
    expect(img).toHaveAttribute("src", "https://images.unsplash.com/a.jpg")
    expect(img).toHaveAttribute("loading", "lazy")
    expect(img).toHaveClass("rounded")
    expect(img).toHaveAttribute("width", "100")
  })

  it("never hands a host that isn't allowed to next/image, which would throw; it stays a plain <img>", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGE_HOSTS", "images.unsplash.com")
    render(<RemoteImage src="https://some-other-host.example/a.jpg" alt="Elsewhere" width={100} height={50} />)
    expect(screen.getByRole("img", { name: "Elsewhere" })).toHaveAttribute("src", "https://some-other-host.example/a.jpg")
  })

  it("loads a priority image eagerly", () => {
    render(<RemoteImage src="https://x.example/a.jpg" alt="Hero" width={10} height={10} priority />)
    expect(screen.getByRole("img", { name: "Hero" })).toHaveAttribute("loading", "eager")
  })
})
