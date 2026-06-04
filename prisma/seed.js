import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/prisma.js'

async function main() {
  const adminPassword = await bcrypt.hash('palaceline1234', 10)
  const cashierPassword = await bcrypt.hash('cashier1234', 10)

  console.log('Seeding users...')
  await prisma.user.upsert({
    where: { email: 'admin@palacelinepos.com' },
    update: {
      name: 'Admin User',
      password: adminPassword,
      role: 'ADMIN',
      active: true,
    },
    create: {
      name: 'Admin User',
      email: 'admin@palacelinepos.com',
      password: adminPassword,
      role: 'ADMIN',
      active: true,
    },
  })

  await prisma.user.upsert({
    where: { email: 'cashier@drinkspos.com' },
    update: { password: cashierPassword, active: true },
    create: {
      name: 'Cashier User',
      email: 'cashier@drinkspos.com',
      password: cashierPassword,
      role: 'CASHIER',
    },
  })

  console.log('Seeding categories...')
  const legacyAlcoholic = await prisma.category.findMany({
    where: { name: { in: ['Alcohlic', 'Alcoholic Drinks'] } },
  })

  const alcoholic = await prisma.category.upsert({
    where: { name: 'Alcoholic' },
    update: { hasPackaging: true },
    create: { name: 'Alcoholic', hasPackaging: true },
  })

  for (const legacy of legacyAlcoholic) {
    await prisma.product.updateMany({
      where: { categoryId: legacy.id },
      data: { categoryId: alcoholic.id },
    })
    await prisma.category.delete({ where: { id: legacy.id } })
  }

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
    const existingProduct = await prisma.product.findFirst({
      where: { name: p.name },
      select: { id: true },
    })

    if (existingProduct) {
      await prisma.product.update({
        where: { id: existingProduct.id },
        data: {
          ...productData,
          packageOptions: {
            deleteMany: {},
            create: packageOptions
          }
        },
      })
    } else {
      await prisma.product.create({
        data: {
          ...productData,
          packageOptions: {
            create: packageOptions
          }
        }
      })
    }
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
