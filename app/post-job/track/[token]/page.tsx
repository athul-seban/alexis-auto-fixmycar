import { notFound } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { JobRequestTracker } from "@/components/post-job/JobRequestTracker"
import { prisma } from "@/lib/prisma"
import type { TrackedJobRequest } from "@/components/post-job/types"

interface Props {
  params: Promise<{ token: string }>
}

export const metadata = { title: "Track My Quotes", robots: { index: false, follow: false } }

export default async function TrackJobRequestPage(props: Props) {
  const params = await props.params;
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
    responses: jobRequest.responses.map((r) => ({
      ...r,
      validUntil: r.validUntil?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F8FAFC]">
        <JobRequestTracker jobRequest={serialized} />
      </main>
      <Footer />
    </>
  )
}
