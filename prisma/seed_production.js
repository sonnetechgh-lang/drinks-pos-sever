import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pkg from 'pg'
import bcrypt from 'bcryptjs'

const { Pool } = pkg
const rawDatabaseUrl = process.env.DATABASE_URL || ''
const connectionString = rawDatabaseUrl.replace(/^"|"$/g, '')

if (!connectionString) {
  console.error('DATABASE_URL is not set or empty')
  process.exit(1)
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Starting production seed...')
  
  const adminPassword = await bcrypt.hash('admin-secure-pass-change-me', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@drinkspos.com' },
    update: {},
    create: {
      email: 'admin@drinkspos.com',
      name: 'Production Admin',
      password: adminPassword,
      role: 'ADMIN',
    },
  })

  console.log('Production Admin created:', admin.email)
  console.log('--- IMPORTANT: Change your password after first login! ---')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
