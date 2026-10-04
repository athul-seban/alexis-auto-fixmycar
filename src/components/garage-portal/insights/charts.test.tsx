import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BarChart, DonutChart, FunnelBars, LineAreaChart, niceTicks } from "@/components/garage-portal/insights/charts"

describe("niceTicks", () => {
  it("rounds the ceiling up to a readable step", () => {
    expect(niceTicks(0)).toEqual({ ceil: 1, ticks: [0, 1] })
    expect(niceTicks(7).ceil).toBe(8)
    expect(niceTicks(243).ceil).toBeGreaterThanOrEqual(243)
    const { ticks } = niceTicks(1000)
    expect(ticks[0]).toBe(0)
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(1000)
  })
})

describe("charts", () => {
  it("BarChart exposes each datum as accessible text and a legend", () => {
    const { container } = render(<BarChart aLabel="Created" bLabel="Attended" data={[{ label: "7 Sep", a: 3, b: 2 }, { label: "14 Sep", a: 0, b: 0 }]} />)
    expect(screen.getByRole("img", { name: /Created and Attended/ })).toBeTruthy()
    expect(container.querySelectorAll("title")).toHaveLength(4)
    expect(screen.getByText("Created")).toBeTruthy()
  })

  it("LineAreaChart renders without data and with a single point", () => {
    expect(() => render(<LineAreaChart name="Revenue" data={[]} format={String} />)).not.toThrow()
    const { container } = render(<LineAreaChart name="Revenue" data={[{ label: "x", value: 5 }]} format={(n) => `£${n}`} />)
    expect(container.querySelector("path")).toBeTruthy()
  })

  it("DonutChart shows totals and percentages, or an empty message", () => {
    render(<DonutChart centerLabel="bookings" slices={[{ label: "Widget", value: 3 }, { label: "Direct", value: 1 }]} />)
    expect(screen.getByText("75%")).toBeTruthy()
    expect(screen.getByText("Widget")).toBeTruthy()
    render(<DonutChart centerLabel="bookings" slices={[]} />)
    expect(screen.getByText("No bookings in this period.")).toBeTruthy()
  })

  it("FunnelBars scales bars to the largest step", () => {
    const { container } = render(<FunnelBars steps={[{ label: "Requests", value: 10 }, { label: "Booked", value: 5 }]} />)
    const bars = [...container.querySelectorAll<HTMLElement>("li > div.overflow-hidden > div")]
    expect(bars.map((b) => b.style.width)).toEqual(["100%", "50%"])
  })
})
