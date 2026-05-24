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

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      email: 'admin@test.com',
      name: '系統管理員',
      passwordHash: adminPassword,
      role: 'admin'
    }
  })
  console.log('Created admin:', admin.email)

  // Create PM user
  const pmPassword = await bcrypt.hash('pm123', 10)
  const pm = await prisma.user.upsert({
    where: { email: 'pm@test.com' },
    update: {},
    create: {
      email: 'pm@test.com',
      name: '產品經理',
      passwordHash: pmPassword,
      role: 'pm'
    }
  })
  console.log('Created pm:', pm.email)

  // Create tech lead
  const tlPassword = await bcrypt.hash('tl123', 10)
  const techLead = await prisma.user.upsert({
    where: { email: 'techlead@test.com' },
    update: {},
    create: {
      email: 'techlead@test.com',
      name: '技術主管',
      passwordHash: tlPassword,
      role: 'tech_lead'
    }
  })
  console.log('Created tech lead:', techLead.email)

  // Create developer
  const devPassword = await bcrypt.hash('dev123', 10)
  const developer = await prisma.user.upsert({
    where: { email: 'dev@test.com' },
    update: {},
    create: {
      email: 'dev@test.com',
      name: '開發人員',
      passwordHash: devPassword,
      role: 'developer'
    }
  })
  console.log('Created developer:', developer.email)

  // Create tester
  const testerPassword = await bcrypt.hash('test123', 10)
  const tester = await prisma.user.upsert({
    where: { email: 'tester@test.com' },
    update: {},
    create: {
      email: 'tester@test.com',
      name: '測試人員',
      passwordHash: testerPassword,
      role: 'tester'
    }
  })
  console.log('Created tester:', tester.email)

  // Create a sample project
  const project = await prisma.project.upsert({
    where: { id: 'sample-project-1' },
    update: {},
    create: {
      id: 'sample-project-1',
      name: '範例項目',
      description: '這是一個範例項目，用於測試系統功能',
      status: 'active',
      createdById: pm.id
    }
  })
  console.log('Created project:', project.name)

  // Add project members
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: pm.id } },
    update: {},
    create: {
      projectId: project.id,
      userId: pm.id,
      role: 'pm'
    }
  })
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: techLead.id } },
    update: {},
    create: {
      projectId: project.id,
      userId: techLead.id,
      role: 'tech_lead'
    }
  })
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: developer.id } },
    update: {},
    create: {
      projectId: project.id,
      userId: developer.id,
      role: 'developer'
    }
  })
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
      createdById: pm.id
    }
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
      assigneeId: developer.id,
      estimatedHours: 4
    }
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
      assigneeId: developer.id,
      estimatedHours: 8
    }
  })
  console.log('Created tasks')

  // Link tasks to requirements
  await prisma.taskRequirement.upsert({
    where: { taskId_requirementId: { taskId: task1.id, requirementId: requirement.id } },
    update: {},
    create: {
      taskId: task1.id,
      requirementId: requirement.id
    }
  })
  await prisma.taskRequirement.upsert({
    where: { taskId_requirementId: { taskId: task2.id, requirementId: requirement.id } },
    update: {},
    create: {
      taskId: task2.id,
      requirementId: requirement.id
    }
  })

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
      reporterId: tester.id
    }
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