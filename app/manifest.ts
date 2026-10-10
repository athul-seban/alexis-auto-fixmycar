import type { MetadataRoute } from "next"

// Makes the site installable ("Add to home screen"). Served at /manifest.webmanifest and linked by Next automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Quote My Garage",
    short_name: "QuoteMyGarage",
    description: "Compare quotes from local garages, book online and track your repairs.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1E3A5F",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
