import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorMessage } from "@/lib/errors"
import { logger } from "@/lib/log"

// For uptime monitors and deploy checks: 200 when the app can reach its database, 503 when it can't. Public and cheap (one
// trivial query), and it says nothing about versions, configuration or what is wrong: that goes to the log, not the caller.
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: "ok" }, { headers: NO_STORE })
  } catch (err) {
    logger.error("health.database_unreachable", { error: errorMessage(err) })
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: NO_STORE })
  }
}
