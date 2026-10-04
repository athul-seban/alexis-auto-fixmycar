import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import { DataTable, type DataColumn } from "./data-table"

interface Row {
  id: string
  name: string
  city: string
  status: string
}

const rows: Row[] = [
  { id: "1", name: "Alice", city: "Leeds", status: "Open" },
  { id: "2", name: "Bob", city: "York", status: "Closed" },
]

type Key = "name" | "city"
const columns: DataColumn<Row, Key>[] = [
  { id: "name", header: "Name", sortKey: "name", mobile: "title", cell: (r) => r.name },
  { id: "city", header: "City", sortKey: "city", cell: (r) => r.city },
  { id: "status", header: "Status", mobile: "badge", cell: (r) => r.status },
  { id: "hidden", header: "Secret", mobile: "hidden", cell: () => "desktop-only" },
  { id: "act", header: "", mobile: "actions", cell: (r) => <button>{`Do ${r.name}`}</button> },
]

describe("DataTable", () => {
  it("renders a semantic table and a card list from the same columns", () => {
    const { container } = render(<DataTable caption="People" columns={columns} rows={rows} rowKey={(r) => r.id} />)
    const table = within(container.querySelector("table")!)
    expect(table.getAllByRole("row")).toHaveLength(3) // header + 2
    expect(table.getByRole("columnheader", { name: "Secret" })).toBeInTheDocument()

    const cards = container.querySelectorAll("ul > li")
    expect(cards).toHaveLength(2)
    // The mobile card shows labelled details, not the desktop-only column.
    expect(within(cards[0] as HTMLElement).getByText("City")).toBeInTheDocument()
    expect(cards[0].textContent).not.toContain("desktop-only")
  })

  it("makes the title the tap target and calls onRowClick", () => {
    const onRowClick = vi.fn()
    const { container } = render(
      <DataTable caption="People" columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} rowLabel={(r) => `Open ${r.name}`} />
    )
    const cardButton = container.querySelector("ul li button[aria-label='Open Alice']") as HTMLElement
    fireEvent.click(cardButton)
    expect(onRowClick).toHaveBeenCalledWith(rows[0])
  })

  it("does not open the row when an action button is pressed", () => {
    const onRowClick = vi.fn()
    const { container } = render(<DataTable caption="People" columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} />)
    const tableAction = within(container.querySelector("table")!).getByRole("button", { name: "Do Alice" })
    fireEvent.click(tableAction)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it("sorts from the phone select and the desktop header", () => {
    const onSort = vi.fn()
    const { container } = render(<DataTable caption="People" columns={columns} rows={rows} rowKey={(r) => r.id} sort="name" dir="asc" onSort={onSort} />)
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "city" } })
    expect(onSort).toHaveBeenLastCalledWith("city")
    fireEvent.click(screen.getByRole("button", { name: /Ascending/ }))
    expect(onSort).toHaveBeenLastCalledWith("name")
    fireEvent.click(within(container.querySelector("table")!).getByRole("button", { name: "City" }))
    expect(onSort).toHaveBeenLastCalledWith("city")
    expect(within(container.querySelector("table")!).getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending")
  })

  it("supports selecting rows and select-all", () => {
    const onSelectedChange = vi.fn()
    const { container } = render(
      <DataTable caption="People" columns={columns} rows={rows} rowKey={(r) => r.id} selectable selected={new Set(["1"])} onSelectedChange={onSelectedChange} rowLabel={(r) => r.name} />
    )
    const table = within(container.querySelector("table")!)
    expect(table.getByRole("checkbox", { name: "Select Alice" })).toBeChecked()
    fireEvent.click(table.getByRole("checkbox", { name: "Select Bob" }))
    expect(onSelectedChange).toHaveBeenLastCalledWith(new Set(["1", "2"]))
    fireEvent.click(table.getByRole("checkbox", { name: "Select all on this page" }))
    expect(onSelectedChange).toHaveBeenLastCalledWith(new Set(["1", "2"]))
  })

  it("shows the empty state instead of an empty table", () => {
    render(<DataTable caption="People" columns={columns} rows={[]} rowKey={(r) => r.id} empty={<p>Nobody here</p>} />)
    expect(screen.getByText("Nobody here")).toBeInTheDocument()
    expect(screen.queryByRole("table")).toBeNull()
  })
})
