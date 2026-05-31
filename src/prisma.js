import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pkg from 'pg'
const { Pool } = pkg

const rawDatabaseUrl = process.env.DATABASE_URL || ''
// Strip surrounding quotes if present (dotenv sometimes preserves them)
const connectionString = rawDatabaseUrl.replace(/^"|"$/g, '')

if (!connectionString) {
  console.error('DATABASE_URL is not set or empty')
}

// Create a PG pool with the connection string
const pool = new Pool({ connectionString })

const adapter = new PrismaPg(pool)

export const prisma = new PrismaClient({ adapter })
