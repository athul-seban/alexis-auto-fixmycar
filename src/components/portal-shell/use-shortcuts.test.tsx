import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { GARAGE_NAV } from "./nav"
import { isTypingTarget, useShortcuts } from "./use-shortcuts"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

function Harness({ onHelp }: { onHelp: () => void }) {
  useShortcuts(GARAGE_NAV, onHelp)
  return (
    <div>
      <input type="search" aria-label="Search" />
      <input type="text" aria-label="Plain" />
    </div>
  )
}

beforeEach(() => push.mockReset())

describe("isTypingTarget", () => {
  it("is true for form fields and false for other elements", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true)
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true)
    expect(isTypingTarget(document.createElement("div"))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe("useShortcuts", () => {
  it("navigates on g then a section letter", () => {
    render(<Harness onHelp={() => {}} />)
    fireEvent.keyDown(window, { key: "g" })
    fireEvent.keyDown(window, { key: "b" })
    expect(push).toHaveBeenCalledWith("/garage-dashboard/bookings")
  })

  it("ignores a lone letter, unknown chords and modified keys", () => {
    render(<Harness onHelp={() => {}} />)
    fireEvent.keyDown(window, { key: "b" })
    fireEvent.keyDown(window, { key: "g" })
    fireEvent.keyDown(window, { key: "z" })
    fireEvent.keyDown(window, { key: "g", ctrlKey: true })
    expect(push).not.toHaveBeenCalled()
  })

  it("does nothing while typing in a field", () => {
    const { getByLabelText } = render(<Harness onHelp={() => {}} />)
    const field = getByLabelText("Plain")
    field.focus()
    fireEvent.keyDown(field, { key: "g" })
    fireEvent.keyDown(field, { key: "b" })
    expect(push).not.toHaveBeenCalled()
  })

  it("focuses the search box on / and opens help on ?", () => {
    const onHelp = vi.fn()
    const { getByLabelText } = render(<Harness onHelp={onHelp} />)
    fireEvent.keyDown(window, { key: "/" })
    expect(getByLabelText("Search")).toHaveFocus()
    getByLabelText("Search").blur()
    fireEvent.keyDown(window, { key: "?" })
    expect(onHelp).toHaveBeenCalledTimes(1)
  })
})
