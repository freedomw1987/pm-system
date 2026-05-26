import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const bcrypt = await import("bcryptjs")
  const hash = await bcrypt.hash("agent123", 10)

  // Check if agent exists
  const existing = await prisma.user.findUnique({ where: { email: "agent-dev1@test.com" } })

  if (existing) {
    await prisma.user.update({
      where: { email: "agent-dev1@test.com" },
      data: {
        isAgent: true,
        name: "AI 開發助手",
        agentConfig: { model: "gpt-4o-mini", maxConcurrentTasks: 3, personality: "proactive" }
      }
    })
    console.log("Updated existing user to Agent: agent-dev1@test.com")
  } else {
    await prisma.user.create({
      data: {
        email: "agent-dev1@test.com",
        name: "AI 開發助手",
        passwordHash: hash,
        role: "developer",
        isAgent: true,
        agentConfig: { model: "gpt-4o-mini", maxConcurrentTasks: 3, personality: "proactive" }
      }
    })
    console.log("Created Agent: agent-dev1@test.com")
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())