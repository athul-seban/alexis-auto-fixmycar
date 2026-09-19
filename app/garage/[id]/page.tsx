import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { GarageProfilePage } from "@/components/garage/GarageProfilePage"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata(props: Props) {
  const params = await props.params;
  return {
    title: `${params.id.replace(/-/g, " ")} | Quote My Garage`,
    description: "View garage profile, services, pricing and book an appointment.",
  };
}

export default async function GaragePage(props: Props) {
  const params = await props.params;
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
