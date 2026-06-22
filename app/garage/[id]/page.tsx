import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { GarageProfilePage } from "@/components/garage/GarageProfilePage"

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props) {
  return {
    title: `${params.id.replace(/-/g, " ")} | FixMyCar`,
    description: "View garage profile, services, pricing and book an appointment.",
  }
}

export default function GaragePage({ params }: Props) {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F8FAFC]">
        <GarageProfilePage slug={params.id} />
      </main>
      <Footer />
    </>
  )
}
