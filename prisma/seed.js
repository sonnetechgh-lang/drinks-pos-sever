import 'dotenv/config'
import bcrypt from 'bcryptjs'
import pkg from '@prisma/client'
const { PrismaClient } = pkg

const prisma = new PrismaClient({ adapter: { provider: 'sqlite', url: process.env.DATABASE_URL } })

const adminPassword = await bcrypt.hash('admin1234', 10)
const cashierPassword = await bcrypt.hash('cashier1234', 10)

async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@drinkspos.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@drinkspos.com',
      password: adminPassword,
      role: 'ADMIN',
    },
  })

  await prisma.user.upsert({
    where: { email: 'cashier@drinkspos.com' },
    update: {},
    create: {
      name: 'Cashier User',
      email: 'cashier@drinkspos.com',
      password: cashierPassword,
      role: 'CASHIER',
    },
  })

  const alcoholic = await prisma.category.upsert({
    where: { name: 'Alcoholic' },
    update: {},
    create: { name: 'Alcoholic' },
  })

  const nonAlcoholic = await prisma.category.upsert({
    where: { name: 'Non-Alcoholic' },
    update: {},
    create: { name: 'Non-Alcoholic' },
  })

  const products = [
    { name: 'Beer', price: 3.5, stock: 50, categoryId: alcoholic.id },
    { name: 'Wine', price: 8.0, stock: 50, categoryId: alcoholic.id },
    { name: 'Whiskey', price: 12.0, stock: 50, categoryId: alcoholic.id },
    { name: 'Soda', price: 1.5, stock: 50, categoryId: nonAlcoholic.id },
    { name: 'Water', price: 1.0, stock: 50, categoryId: nonAlcoholic.id },
    { name: 'Juice', price: 2.5, stock: 50, categoryId: nonAlcoholic.id },
  ]

  for (const product of products) {
    await prisma.product.upsert({
      where: { name: product.name },
      update: {
        price: product.price,
        stock: product.stock,
        categoryId: product.categoryId,
      },
      create: product,
    })
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
