import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { changePassword, changePasswordSchema } from "@/lib/change-password"

// Deliberately NOT a { write: true } route: rotating a password is an account action, so a
// suspended garage must still be able to secure its login.
export const POST = withGarage("Garage change-password POST", async (req, { userId }) => {
  const result = await changePassword(userId, changePasswordSchema.parse(await req.json()))
  return NextResponse.json(result.body, { status: result.status })
})
