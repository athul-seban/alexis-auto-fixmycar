import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const pathname = req.nextUrl.pathname

    // Admin routes
    if (pathname.startsWith("/admin") && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/login?error=unauthorized", req.url))
    }

    // Garage dashboard routes
    if (pathname.startsWith("/garage-dashboard") && token?.role !== "GARAGE") {
      return NextResponse.redirect(new URL("/login?error=unauthorized", req.url))
    }

    // Owner dashboard routes
    if (pathname.startsWith("/dashboard") && token?.role !== "OWNER") {
      return NextResponse.redirect(new URL("/login?error=unauthorized", req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname
        const protectedRoutes = ["/dashboard", "/garage-dashboard", "/admin"]
        if (protectedRoutes.some((route) => pathname.startsWith(route))) {
          return !!token
        }
        return true
      },
    },
  }
)

export const config = {
  matcher: ["/dashboard/:path*", "/garage-dashboard/:path*", "/admin/:path*"],
}
