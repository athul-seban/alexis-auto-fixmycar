import { Suspense } from "react"
import { DiaryPage } from "@/components/garage-portal/diary/DiaryPage"

export const metadata = { title: "Diary" }

export default function GarageDiaryRoute() {
  // DiaryPage keeps the date/view/technician in the query string, which requires Suspense.
  return (
    <Suspense>
      <DiaryPage />
    </Suspense>
  )
}
