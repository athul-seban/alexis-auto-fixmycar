import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { Button } from "./button"

describe("Button", () => {
  it("renders children text", () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument()
  })

  it("calls onClick when clicked", () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)
    fireEvent.click(screen.getByRole("button", { name: "Go" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick} disabled>Go</Button>)
    fireEvent.click(screen.getByRole("button", { name: "Go" }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it("shows a loading state and disables the button", () => {
    render(<Button loading>Save</Button>)
    const button = screen.getByRole("button")
    expect(button).toBeDisabled()
    expect(screen.getByText("Loading...")).toBeInTheDocument()
    expect(screen.queryByText("Save")).not.toBeInTheDocument()
  })

  it("does not call onClick while loading", () => {
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Save</Button>)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).not.toHaveBeenCalled()
  })

  it("applies the variant class", () => {
    render(<Button variant="outline">Outline</Button>)
    expect(screen.getByRole("button")).toHaveClass("border-2")
  })
})
