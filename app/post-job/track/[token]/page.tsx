import { notFound } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { JobRequestTracker } from "@/components/post-job/JobRequestTracker"
import { prisma } from "@/lib/prisma"
import { expireDueRequests } from "@/lib/portal/quote-request-service"
import type { TrackedJobRequest } from "@/components/post-job/types"

interface Props {
  params: Promise<{ token: string }>
}

export const metadata = { title: "Track My Quotes", robots: { index: false, follow: false } }

export default async function TrackJobRequestPage(props: Props) {
  const params = await props.params;
  // A garage that missed its quoting deadline closes the request (or sends an estimate) before the customer looks.
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

  if (!jobRequest) notFound()

  const serialized: TrackedJobRequest = {
    ...jobRequest,
    preferredDate: jobRequest.preferredDate?.toISOString() ?? null,
    createdAt: jobRequest.createdAt.toISOString(),
    respondBy: jobRequest.respondBy?.toISOString() ?? null,
    responses: jobRequest.responses.map((r) => ({
      ...r,
      validUntil: r.validUntil?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950">
        <JobRequestTracker jobRequest={serialized} />
      </main>
      <Footer />
    </>
  )
}
