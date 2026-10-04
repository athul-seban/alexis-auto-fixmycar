import { JobSheet } from "@/components/garage-portal/bookings/JobSheet"

export const metadata = { title: "Job sheet" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <JobSheet bookingId={id} />
}
