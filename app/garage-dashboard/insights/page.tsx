import { Suspense } from "react"
import { InsightsPage } from "@/components/garage-portal/insights/InsightsPage"

export const metadata = { title: "Insights" }

export default function GarageInsightsRoute() {
  // InsightsPage keeps the date range in the query string, which requires Suspense.
  return (
    <Suspense>
      <InsightsPage />
    </Suspense>
  )
}
