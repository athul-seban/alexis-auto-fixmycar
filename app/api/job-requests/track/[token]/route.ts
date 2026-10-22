import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { expireDueRequests } from "@/lib/portal/quote-request-service"
import { limitByIp } from "@/lib/rate-limit"

interface Params {
  params: Promise<{ token: string }>
}

export async function GET(req: Request, props: Params) {
  const params = await props.params;
  // The tracking page polls, so the allowance is generous; it exists to stop token guessing, not to slow a customer down.
  const limited = await limitByIp(req.headers, "job-track", 120, 60_000)
  if (limited) return limited
  try {
    const found = await prisma.jobRequest.findUnique({ where: { token: params.token }, select: { id: true } })
    if (found) await expireDueRequests({ jobId: found.id })
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
