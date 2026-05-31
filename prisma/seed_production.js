import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

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
