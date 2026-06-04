import 'dotenv/config'
import bcrypt from 'bcryptjs'
import pkg from '@prisma/client'
const { PrismaClient } = pkg

const prisma = new PrismaClient()

async function main() {
  const adminPassword = await bcrypt.hash('admin1234', 10)
  const cashierPassword = await bcrypt.hash('cashier1234', 10)

  console.log('Seeding users...')
  await prisma.user.upsert({
    where: { email: 'admin@drinkspos.com' },
    update: { password: adminPassword },
    create: {
      name: 'Admin User',
      email: 'admin@drinkspos.com',
      password: adminPassword,
      role: 'ADMIN',
    },
  })

  await prisma.user.upsert({
    where: { email: 'cashier@drinkspos.com' },
    update: { password: cashierPassword },
    create: {
      name: 'Cashier User',
      email: 'cashier@drinkspos.com',
      password: cashierPassword,
      role: 'CASHIER',
    },
  })

  console.log('Seeding categories...')
  const alcoholic = await prisma.category.upsert({
    where: { name: 'Alcoholic' },
    update: { hasPackaging: true },
    create: { name: 'Alcoholic', hasPackaging: true },
  })

  const nonAlcoholic = await prisma.category.upsert({
    where: { name: 'Non-Alcoholic' },
    update: { hasPackaging: false },
    create: { name: 'Non-Alcoholic', hasPackaging: false },
  })

  console.log('Seeding products...')
  const products = [
    {
      name: 'Club Beer (625ml)',
      price: 15.0,
      stock: 120,
      categoryId: alcoholic.id,
      baseUnit: 'BOTTLE',
      packageOptions: [
        { name: 'Single Bottle', unitsPerBase: 1, price: 15.0, isDefault: true },
        { name: 'Carton (12)', unitsPerBase: 12, price: 170.0, wholesalePrice: 165.0 }
      ]
    },
    {
      name: 'Guinness Stout',
      price: 12.0,
      stock: 96,
      categoryId: alcoholic.id,
      baseUnit: 'BOTTLE',
      packageOptions: [
        { name: 'Single Bottle', unitsPerBase: 1, price: 12.0, isDefault: true },
        { name: 'Carton (24)', unitsPerBase: 24, price: 270.0, wholesalePrice: 260.0 }
      ]
    },
    {
      name: 'Coca Cola (500ml)',
      price: 5.0,
      stock: 200,
      categoryId: nonAlcoholic.id,
      baseUnit: 'UNIT',
      packageOptions: [
        { name: 'Unit', unitsPerBase: 1, price: 5.0, isDefault: true },
        { name: 'Pack (12)', unitsPerBase: 12, price: 55.0 }
      ]
    },
    {
      name: 'Voltic Water (750ml)',
      price: 3.0,
      stock: 500,
      categoryId: nonAlcoholic.id,
      baseUnit: 'UNIT',
      packageOptions: [
        { name: 'Unit', unitsPerBase: 1, price: 3.0, isDefault: true },
        { name: 'Pack (15)', unitsPerBase: 15, price: 40.0 }
      ]
    }
  ]

  for (const p of products) {
    const { packageOptions, ...productData } = p
    await prisma.product.upsert({
      where: { name: p.name },
      update: {
        ...productData,
        packageOptions: {
          deleteMany: {},
          create: packageOptions
        }
      },
      create: {
        ...productData,
        packageOptions: {
          create: packageOptions
        }
      }
    })
  }

  console.log('Seeding completed successfully.')
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
