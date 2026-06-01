import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import 'dotenv/config'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings to avoid concurrent query warnings
  max: 20,                    // Maximum connections in pool
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Timeout for getting a connection
  // Queue requests when pool is exhausted
  allowExitOnIdle: false,
})

const adapter = new PrismaPg(pool)

const prisma = new PrismaClient({
  adapter,
})

export { prisma }