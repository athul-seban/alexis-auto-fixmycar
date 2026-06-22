import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 10)

  const admin = await prisma.user.upsert({
    where: { email: "admin@fixmycar.dev" },
    update: {},
    create: {
      email: "admin@fixmycar.dev",
      name: "Admin",
      password: adminPassword,
      role: "ADMIN",
    },
  })

  console.log("✅ Admin user ready:", admin.email)
  console.log("   Password: admin123")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
