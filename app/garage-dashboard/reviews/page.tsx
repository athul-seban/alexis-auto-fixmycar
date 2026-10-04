import { Suspense } from "react"
import { ReviewsPage } from "@/components/garage-portal/reviews/ReviewsPage"

export const metadata = { title: "Reviews" }

export default function GarageReviewsRoute() {
  // ReviewsPage keeps rating/reply filters in the query string, which requires Suspense.
  return (
    <Suspense>
      <ReviewsPage />
    </Suspense>
  )
}
