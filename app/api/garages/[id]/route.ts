import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseServiceList, toGarageProfile } from "@/lib/garage-mapper"
import { SERVICE_TYPES } from "@/lib/constants"
import { openingHoursSchema } from "@/lib/portal/opening-hours"
import { handleRouteError } from "@/lib/portal/route-errors"
import { getPublicGarage } from "@/lib/public-garage"
import { isOwnGarageImageUrl } from "@/lib/image-sniff"
import { can } from "@/lib/org/access"
import { readOnlyReason } from "@/lib/org/location-status"
import { invalidateSiteForGarage } from "@/lib/site/cache"
import { accessToLocation } from "@/lib/org/resolve"
import { z } from "zod"
import { requireSession } from "@/lib/session"

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, props: Params) {
  const params = await props.params
  try {
    const garage = await getPublicGarage(params.id)
    if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })
    return NextResponse.json({ garage })
  } catch (err) {
    console.error("Garage GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// z.string().url() also accepts javascript:/data: URIs, which would become clickable links on the
// public profile — only http(s) is allowed.
const httpUrl = (message: string) =>
  z.string().trim().url(message).max(500).refine((u) => /^https?:\/\//i.test(u), message)

const patchSchema = z.object({
  name: z.string().trim().min(2, "Garage name is too short").max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  phone: z.string().trim().min(6, "Enter a valid phone number").max(30).optional(),
  email: z.string().trim().email("Enter a valid email address").max(200).optional(),
  website: z.union([httpUrl("Website must start with http:// or https://"), z.literal("")]).nullable().optional(),
  address: z.string().trim().min(3).max(200).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  postcode: z.string().trim().min(3, "Enter a valid postcode").max(10).optional(),
  isMobile: z.boolean().optional(),
  services: z.array(z.enum(SERVICE_TYPES)).max(SERVICE_TYPES.length).optional(),
  openingHours: openingHoursSchema.optional(),
  logo: httpUrl("Logo must be an http(s) image URL").nullable().optional(),
})

export async function PATCH(req: Request, props: Params) {
  const params = await props.params;
  const auth = await requireSession()
  if (!auth.ok) return auth.response
  const { user } = auth
  if (user.role !== "GARAGE") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    // Editing a location's profile needs profile.edit AT THAT LOCATION (a member can hold several).
    const here = await accessToLocation(user.id, params.id)
    if (!here || !can(here.access, "profile.edit")) {
      return NextResponse.json({ error: "Garage not found or unauthorized" }, { status: 403 })
    }
    const garage = here.garage
    const readOnly = readOnlyReason(garage.status)
    if (readOnly) return NextResponse.json({ error: readOnly.message, code: readOnly.code }, { status: 403 })

    const data = patchSchema.parse(await req.json())
    // The logo is uploaded through /api/upload, which stores it under the garage's own folder; an arbitrary URL here would
    // let a profile point at any third-party image (tracking pixels, hotlinked or hostile content).
    if (data.logo && !isOwnGarageImageUrl(data.logo, garage.id)) {
      return NextResponse.json({ error: "Upload the logo as an image instead of linking to one" }, { status: 400 })
    }
    const updated = await prisma.garage.update({
      where: { id: params.id },
      data: {
        name: data.name,
        description: data.description,
        phone: data.phone,
        email: data.email,
        website: data.website === undefined ? undefined : data.website || null,
        address: data.address,
        city: data.city,
        postcode: data.postcode?.toUpperCase(),
        isMobile: data.isMobile,
        services: data.services ? JSON.stringify(data.services) : undefined,
        openingHours: data.openingHours ? JSON.stringify(data.openingHours) : undefined,
        logo: data.logo,
      },
    })

    // The business's website shows this location's address, hours and services live.
    await invalidateSiteForGarage(updated.id)

    const verificationBadges = parseServiceList(updated.verificationBadges)
    return NextResponse.json({ garage: { ...toGarageProfile(updated), verificationBadges } })
  } catch (err) {
    return handleRouteError(err, "Garage PATCH")
  }
}
