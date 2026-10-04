import { Suspense } from "react"
import { BookingWidget } from "@/components/widget/BookingWidget"

export default async function WidgetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // BookingWidget reads ?theme= and ?accent=, which requires a Suspense boundary.
  return (
    <Suspense>
      <BookingWidget slug={slug} />
    </Suspense>
  )
}
