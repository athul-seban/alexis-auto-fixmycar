import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/layout/Providers"
import { RegisterServiceWorker } from "@/components/layout/RegisterServiceWorker"

const inter = Inter({ subsets: ["latin"] })

export const viewport: Viewport = { themeColor: "#1E3A5F" }

export const metadata: Metadata = {
  applicationName: "Quote My Garage",
  appleWebApp: { capable: true, title: "Quote My Garage", statusBarStyle: "default" },
  icons: { icon: "/icons/192", apple: "/icons/192" },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Quote My Garage – Find Trusted Local Garages & Mechanics",
    template: "%s | Quote My Garage",
  },
  description:
    "Compare quotes from 15,000+ local garages, mobile mechanics and dealerships. Book online, save money, and get your car fixed fast.",
  keywords: [
    "car repair",
    "mechanic",
    "garage",
    "MOT",
    "car service",
    "auto repair",
    "fix my car",
  ],
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: process.env.NEXT_PUBLIC_APP_URL,
    siteName: "Quote My Garage",
    title: "Quote My Garage – Find Trusted Local Garages & Mechanics",
    description:
      "Compare quotes from 15,000+ local garages, mobile mechanics and dealerships.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Quote My Garage – Find Trusted Local Garages & Mechanics",
    description:
      "Compare quotes from 15,000+ local garages and mechanics. Book online and save.",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
