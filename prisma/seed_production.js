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

const adminEmail = process.env.ADMIN_EMAIL || 'admin@palacelane.com'
const adminPasswordPlain = process.env.ADMIN_PASSWORD || 'Cornerstone@1'

async function main() {
  console.log('Starting production seed...')
  
  const adminPassword = await bcrypt.hash(adminPasswordPlain, 10)

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
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
