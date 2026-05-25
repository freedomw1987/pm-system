import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  // Seed all built-in users — always reset role to correct built-in value
  const builtInUsers = [
    { email: 'admin@test.com', name: '系統管理員', password: 'admin123', role: 'admin' },
    { email: 'pm@test.com', name: '產品經理', password: 'pm123', role: 'pm' },
    { email: 'techlead@test.com', name: '技術主管', password: 'tl123', role: 'tech_lead' },
    { email: 'dev@test.com', name: '開發人員', password: 'dev123', role: 'developer' },
    { email: 'tester@test.com', name: '測試人員', password: 'test123', role: 'tester' },
  ]

  // Lookup map: email -> user record after upsert
  const userByEmail: Record<string, any> = {}
  for (const u of builtInUsers) {
    const pw = await bcrypt.hash(u.password, 10)
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, name: u.name },
      create: { email: u.email, name: u.name, passwordHash: pw, role: u.role },
    })
    userByEmail[u.email] = user
    console.log(`Created/updated user: ${user.email} (role=${user.role})`)
  }

  // Create a sample project
  const project = await prisma.project.upsert({
    where: { id: 'sample-project-1' },
    update: {},
    create: {
      id: 'sample-project-1',
      name: '範例項目',
      description: '這是一個範例項目，用於測試系統功能',
      status: 'active',
      createdById: userByEmail['pm@test.com'].id,
    },
  })
  console.log('Created project:', project.name)

  // Add project members
  const members = [
    { user: userByEmail['pm@test.com'], role: 'pm' },
    { user: userByEmail['techlead@test.com'], role: 'tech_lead' },
    { user: userByEmail['dev@test.com'], role: 'developer' },
  ]
  for (const m of members) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: m.user.id } },
      update: {},
      create: { projectId: project.id, userId: m.user.id, role: m.role },
    })
  }
  console.log('Added project members')

  // Create a sample requirement
  const requirement = await prisma.requirement.upsert({
    where: { id: 'sample-req-1' },
    update: {},
    create: {
      id: 'sample-req-1',
      projectId: project.id,
      title: '用戶登入功能',
      description: '實現用戶 email/password 登入功能',
      status: 'in_progress',
      createdById: userByEmail['pm@test.com'].id,
    },
  })
  console.log('Created requirement:', requirement.title)

  // Create sample tasks
  const task1 = await prisma.task.upsert({
    where: { id: 'sample-task-1' },
    update: {},
    create: {
      id: 'sample-task-1',
      projectId: project.id,
      title: '設計登入頁面',
      description: '設計用戶登入介面',
      status: 'completed',
      assigneeId: userByEmail['dev@test.com'].id,
      estimatedHours: 4,
    },
  })

  const task2 = await prisma.task.upsert({
    where: { id: 'sample-task-2' },
    update: {},
    create: {
      id: 'sample-task-2',
      projectId: project.id,
      title: '實現後端登入 API',
      description: '實現 JWT 認證的登入 API',
      status: 'in_progress',
      assigneeId: userByEmail['dev@test.com'].id,
      estimatedHours: 8,
    },
  })
  console.log('Created tasks')

  // Link tasks to requirements
  for (const task of [task1, task2]) {
    await prisma.taskRequirement.upsert({
      where: { taskId_requirementId: { taskId: task.id, requirementId: requirement.id } },
      update: {},
      create: { taskId: task.id, requirementId: requirement.id },
    })
  }

  // Create sample bugs
  await prisma.bug.upsert({
    where: { id: 'sample-bug-1' },
    update: {},
    create: {
      id: 'sample-bug-1',
      projectId: project.id,
      taskId: task1.id,
      title: '登入密碼輸入框无法聚焦',
      description: '在 iOS Safari 上密碼輸入框無法聚焦',
      severity: 'medium',
      status: 'open',
      reporterId: userByEmail['tester@test.com'].id,
    },
  })
  console.log('Created bugs')

  console.log('✅ Seeding completed!')
}

main()
  .catch((e) => {
    console.error('Seeding error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })