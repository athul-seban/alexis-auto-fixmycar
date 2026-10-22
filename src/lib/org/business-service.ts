import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { formatPhone, isValidUkPhone } from "@/lib/portal/phone"
import { formatVat, isValidUkVat } from "@/lib/portal/vat"
import type { GarageContext } from "@/lib/garage-auth"
import { OrgError } from "@/lib/org/org-error"

// The business itself: its name, legal details and contact details. The VAT number belongs to the business, so changing
// it changes it on every location (invoices print the location's copy).

type Ctx = Pick<GarageContext, "organisation" | "actor">

function business(ctx: Ctx) {
  if (!ctx.organisation) throw new OrgError("CONFLICT", "This garage hasn't been set up as a business yet. Ask support to run the upgrade.")
  return ctx.organisation
}

const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() ? v.trim() : null)

export const businessSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the business name").max(100),
    legalName: z.string().trim().max(150).nullable(),
    vatNumber: z
      .string()
      .trim()
      .nullable()
      .refine((v) => !v || isValidUkVat(v), "Enter a valid UK VAT number, e.g. GB123456789"),
    contactEmail: z.string().trim().toLowerCase().max(200).nullable().refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email address"),
    contactPhone: z.string().trim().max(30).nullable().refine((v) => !v || isValidUkPhone(v), "Enter a valid UK phone number, e.g. 020 7123 4567"),
    website: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), "Website must start with http:// or https://"),
    description: z.string().trim().max(2000).nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update")

export type BusinessInput = z.infer<typeof businessSchema>

export interface BusinessView {
  id: string
  name: string
  legalName: string | null
  vatNumber: string | null
  contactEmail: string | null
  contactPhone: string | null
  website: string | null
  description: string | null
  locationCount: number
}

export async function getBusiness(ctx: Ctx): Promise<BusinessView> {
  const org = business(ctx)
  const [row, locationCount] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: org.id } }),
    prisma.garage.count({ where: { organisationId: org.id, status: { not: "ARCHIVED" } } }),
  ])
  return {
    id: row.id,
    name: row.name,
    legalName: row.legalName,
    vatNumber: row.vatNumber,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    website: row.website,
    description: row.description,
    locationCount,
  }
}

export async function updateBusiness(ctx: Ctx, input: BusinessInput): Promise<BusinessView> {
  const org = business(ctx)
  const data = {
    name: input.name,
    legalName: blankToNull(input.legalName),
    vatNumber: input.vatNumber === undefined ? undefined : input.vatNumber?.trim() ? formatVat(input.vatNumber) : null,
    contactEmail: blankToNull(input.contactEmail),
    contactPhone: input.contactPhone === undefined ? undefined : input.contactPhone?.trim() ? formatPhone(input.contactPhone) : null,
    website: blankToNull(input.website),
    description: blankToNull(input.description),
  }
  const before = await prisma.organisation.findUniqueOrThrow({ where: { id: org.id } })
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => data[k] !== undefined && data[k] !== before[k])

  await prisma.$transaction(async (tx) => {
    await tx.organisation.update({ where: { id: org.id }, data })
    // One VAT number for the whole business: every location's invoices follow it.
    if (changed.includes("vatNumber")) await tx.garage.updateMany({ where: { organisationId: org.id }, data: { vatNumber: data.vatNumber ?? null } })
  })

  if (changed.length > 0) {
    // Which fields changed, never their values (a VAT number or phone isn't for the log).
    await audit({ user: ctx.actor }, { action: "BUSINESS_UPDATED", targetType: "ORGANISATION", targetId: org.id, organisationId: org.id, detail: `Changed: ${changed.join(", ")}` })
  }
  return getBusiness(ctx)
}
