import type { MetadataRoute } from "next"
import { absoluteUrl } from "@/lib/portal/links"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private areas and APIs; the portals also send noindex, this just saves crawl budget.
        disallow: ["/api/", "/admin", "/dashboard", "/garage-dashboard", "/widget/", "/post-login", "/post-job/track/", "/booking/", "/reset-password"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  }
}
