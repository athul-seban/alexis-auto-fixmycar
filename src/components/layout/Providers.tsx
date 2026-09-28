"use client"

import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "next-themes"
import { CompareProvider } from "@/context/CompareContext"
import { CompareBar } from "@/components/compare/CompareBar"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionProvider>
        <CompareProvider>
          {children}
          <CompareBar />
        </CompareProvider>
      </SessionProvider>
    </ThemeProvider>
  )
}
