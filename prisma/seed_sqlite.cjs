const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')
const { randomUUID } = require('crypto')

const db = new Database('dev.db')

console.log('Existing tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all())

async function run() {
  const adminId = randomUUID()
  const cashierId = randomUUID()
  const adminPassword = await bcrypt.hash('admin1234', 10)
  const cashierPassword = await bcrypt.hash('cashier1234', 10)

  // Insert users if they don't exist
  const findUser = db.prepare('SELECT id FROM "User" WHERE email = ?')
  const insertUser = db.prepare("INSERT INTO \"User\" (id, name, email, password, role, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))")

  if (!findUser.get('admin@drinkspos.com')) {
    insertUser.run(adminId, 'Admin User', 'admin@drinkspos.com', adminPassword, 'ADMIN')
    console.log('Inserted admin user')
  } else {
    console.log('Admin user already exists')
  }

  if (!findUser.get('cashier@drinkspos.com')) {
    insertUser.run(cashierId, 'Cashier User', 'cashier@drinkspos.com', cashierPassword, 'CASHIER')
    console.log('Inserted cashier user')
  } else {
    console.log('Cashier user already exists')
  }

  // Categories
  const findCategory = db.prepare('SELECT id FROM "Category" WHERE name = ?')
  const insertCategory = db.prepare('INSERT INTO "Category" (id, name) VALUES (?, ?)')

  function upsertCategory(name) {
    const row = findCategory.get(name)
    if (row) return row.id
    const id = randomUUID()
    insertCategory.run(id, name)
    return id
  }

  const alcoholicId = upsertCategory('Alcoholic')
  const nonAlcoholicId = upsertCategory('Non-Alcoholic')

  // Products
  const findProduct = db.prepare('SELECT id FROM "Product" WHERE name = ?')
  const insertProduct = db.prepare("INSERT INTO \"Product\" (id, name, price, stock, categoryId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))")

  const products = [
    { name: 'Beer', price: 3.5, stock: 50, categoryId: alcoholicId },
    { name: 'Wine', price: 8.0, stock: 50, categoryId: alcoholicId },
    { name: 'Whiskey', price: 12.0, stock: 50, categoryId: alcoholicId },
    { name: 'Soda', price: 1.5, stock: 50, categoryId: nonAlcoholicId },
    { name: 'Water', price: 1.0, stock: 50, categoryId: nonAlcoholicId },
    { name: 'Juice', price: 2.5, stock: 50, categoryId: nonAlcoholicId },
  ]

  for (const p of products) {
    if (!findProduct.get(p.name)) {
      insertProduct.run(randomUUID(), p.name, p.price, p.stock, p.categoryId)
      console.log('Inserted product', p.name)
    } else {
      console.log('Product exists', p.name)
    }
  }

  console.log('Seeding complete')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
