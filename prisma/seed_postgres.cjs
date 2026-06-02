require('dotenv').config()
const { Client } = require('pg')
const bcrypt = require('bcryptjs')
const { randomUUID } = require('crypto')

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function run() {
  await client.connect()

  const adminPassword = await bcrypt.hash('admin1234', 10)
  const cashierPassword = await bcrypt.hash('cashier1234', 10)

  await client.query('BEGIN')

  try {
    const insertUserText = 'INSERT INTO "User" (id, name, email, password, role, "createdAt") SELECT $1, $2, $3, $4, $5, NOW() WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = $3)'
    await client.query(insertUserText, [randomUUID(), 'Admin User', 'admin@drinkspos.com', adminPassword, 'ADMIN'])
    await client.query(insertUserText, [randomUUID(), 'Cashier User', 'cashier@drinkspos.com', cashierPassword, 'CASHIER'])

    const insertCategoryText = 'INSERT INTO "Category" (id, name) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE name = $2)'
    await client.query(insertCategoryText, [randomUUID(), 'Alcoholic'])
    await client.query(insertCategoryText, [randomUUID(), 'Non-Alcoholic'])

    const categoryIds = {}
    const existingCategories = await client.query('SELECT name, id FROM "Category" WHERE name IN ($1, $2)', ['Alcoholic', 'Non-Alcoholic'])
    existingCategories.rows.forEach((row) => {
      if (row.name === 'Alcoholic') categoryIds.alcoholic = row.id
      if (row.name === 'Non-Alcoholic') categoryIds.nonAlcoholic = row.id
    })

    const products = [
      { name: 'Beer', price: 3.5, stock: 50, categoryId: categoryIds.alcoholic },
      { name: 'Wine', price: 8.0, stock: 50, categoryId: categoryIds.alcoholic },
      { name: 'Whiskey', price: 12.0, stock: 50, categoryId: categoryIds.alcoholic },
      { name: 'Soda', price: 1.5, stock: 50, categoryId: categoryIds.nonAlcoholic },
      { name: 'Water', price: 1.0, stock: 50, categoryId: categoryIds.nonAlcoholic },
      { name: 'Juice', price: 2.5, stock: 50, categoryId: categoryIds.nonAlcoholic },
    ]

    const insertProductText = 'INSERT INTO "Product" (id, name, price, stock, "categoryId", "createdAt", "updatedAt") SELECT $1, $2, $3, $4, $5, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "Product" WHERE name = $2)'
    for (const product of products) {
      await client.query(insertProductText, [randomUUID(), product.name, product.price, product.stock, product.categoryId])
    }

    await client.query('COMMIT')
    console.log('Postgres seeding complete')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Seeding failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
