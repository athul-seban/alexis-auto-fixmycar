import { z } from "zod"

export const technicianSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.union([z.string().trim().email().max(200), z.literal("")]).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value like #1E3A5F").optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
})

export const TECHNICIAN_SELECT = {
  id: true, name: true, email: true, phone: true, color: true, isActive: true, sortOrder: true,
} as const
