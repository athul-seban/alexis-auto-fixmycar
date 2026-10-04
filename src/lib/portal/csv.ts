// Minimal CSV writer with spreadsheet formula-injection protection.
// Cells that a spreadsheet would interpret as a formula (= + - @ TAB CR) get a leading
// apostrophe. Numbers are written as numbers and never prefixed.

const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"

  let s = value instanceof Date ? value.toISOString() : String(value)
  if (FORMULA_START.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(headers: string[], rows: unknown[][], opts: { bom?: boolean } = {}): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","))
  return (opts.bom ? "﻿" : "") + lines.join("\r\n") + "\r\n"
}

export const CSV_MAX_ROWS = 5000
