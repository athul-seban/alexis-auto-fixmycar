import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

interface Params {
  params: Promise<{ token: string }>
}

export async function GET(_req: Request, props: Params) {
  const params = await props.params;
  try {
    const jobRequest = await prisma.jobRequest.findUnique({
      where: { token: params.token },
      include: {
        responses: {
          orderBy: { price: "asc" },
          include: {
            garage: {
              select: {
                id: true, name: true, slug: true, city: true, postcode: true,
                logo: true, isVerified: true, isMobile: true, averageRating: true,
                totalReviews: true, phone: true,
              },
            },
          },
        },
      },
    })

    if (!jobRequest) {
      return NextResponse.json({ error: "Job request not found" }, { status: 404 })
    }

    return NextResponse.json({ jobRequest })
  } catch (err) {
    console.error("Job request track GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
