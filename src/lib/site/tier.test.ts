import { afterEach, describe, expect, it } from "vitest"
import { defaultContent, defaultPro } from "@/lib/site/content"
import { contentForTier, mergeSavedContent, siteTier, withoutAdvanced } from "@/lib/site/tier"

const free = { plan: "FREE", subscriptionStatus: null }
const premium = { plan: "PREMIUM", subscriptionStatus: "active" }

afterEach(() => {
  delete process.env.PLANS_ENFORCED
})

const withPro = () => {
  const c = defaultContent("Acme Motors")
  c.pro = { ...defaultPro(), heroLayout: "split", heroHeight: "tall", heroFocus: "top", hideCredit: true, announcement: { show: true, text: "Closed Monday", href: "" } }
  return c
}

describe("siteTier", () => {
  it("gives everyone the advanced website while plans aren't enforced, and says so", () => {
    const t = siteTier(free)
    expect(t).toMatchObject({ advanced: true, enforced: false, currentPlanLabel: "Free" })
  })

  it("reserves it for Premium once enforced, and names the plan and its price for the upgrade message", () => {
    process.env.PLANS_ENFORCED = "true"
    expect(siteTier(free)).toMatchObject({ advanced: false, enforced: true, currentPlanLabel: "Free", proPlan: { id: "PREMIUM", label: "Premium", priceGbpPerMonth: 59 } })
    expect(siteTier(premium)).toMatchObject({ advanced: true, currentPlanLabel: "Premium" })
    expect(siteTier({ plan: "PREMIUM", subscriptionStatus: "canceled" }).advanced).toBe(false)
  })
})

describe("what visitors see", () => {
  it("is the basic design for a business without the plan, whatever it saved", () => {
    const c = withPro()
    expect(contentForTier(c, { advanced: false }).pro).toEqual(defaultPro())
    expect(withoutAdvanced(c).pro).toEqual(defaultPro())
    expect(c.pro.heroLayout).toBe("split") // the original is untouched: upgrading brings the design back
  })

  it("is the saved design for a business with it", () => {
    const c = withPro()
    expect(contentForTier(c, { advanced: true })).toBe(c)
  })

  it("never touches the basic settings (headline, photo, overlay, alignment)", () => {
    const c = withPro()
    c.hero.overlay = "brand"
    c.hero.align = "center"
    c.hero.headline = "Custom"
    const basic = contentForTier(c, { advanced: false })
    expect(basic.hero).toEqual(c.hero)
  })
})

describe("saving", () => {
  it("keeps a business's advanced changes when it has the plan", () => {
    const merged = mergeSavedContent(withPro(), defaultContent("Acme Motors"), { advanced: true })
    expect(merged.pro.heroLayout).toBe("split")
  })

  it("ignores advanced changes from a business without it, keeping what was saved before", () => {
    const previous = withPro()
    previous.pro.heroLayout = "standard"
    previous.pro.hideCredit = false
    const incoming = withPro() // tries to switch the advanced options on
    incoming.hero.headline = "New headline"
    const merged = mergeSavedContent(incoming, previous, { advanced: false })
    expect(merged.pro).toEqual(previous.pro)
    expect(merged.hero.headline).toBe("New headline") // ordinary edits still go through
  })
})
